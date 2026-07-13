/**
 * UserVisibilityService
 *
 * Manages the explicit (unit_id, department_id) mapping that controls which
 * data each user is allowed to see across Budget, Indent, PO, GRN, etc.
 *
 * Two operations:
 *   getVisibilityTree(userId, orgId)
 *     → Returns all units for the org, each with their departments and a
 *       `selected` flag indicating whether that (unit, dept) pair is currently
 *       mapped for the user. Used by the admin UI to pre-populate checkboxes.
 *
 *   saveVisibility(userId, mappings, createdBy)
 *     → Atomically replaces all mappings for the user with the submitted list.
 *       Validates that every (unit_id, department_id) pair belongs to the
 *       same org before writing, to prevent cross-org data leakage.
 */

const { sequelize } = require('../models/index');
const { MasterUnit, Department, User } = require('../models/index');
const { userVisibilityRepository } = require('../repository/index');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');

/**
 * Builds the unit → department tree annotated with which pairs are currently
 * selected for the given user.
 *
 * @param {number} userId
 * @param {number} orgId
 * @returns {Promise<{ units: UnitNode[] }>}
 */
exports.getVisibilityTree = async (userId, orgId) => {
	const user = await User.findByPk(userId, { attributes: ['id'] });
	if (!user) {
		throw new AppError('User not found', StatusCodes.NOT_FOUND);
	}

	const [units, departments, existingMappings, lastMapping] = await Promise.all([
		MasterUnit.findAll({
			where: { org_id: orgId },
			attributes: ['id', 'unitName', 'unitCd', 'unit_name'],
			order: [['unitName', 'ASC']],
		}),
		Department.findAll({
			where: { org_id: orgId, unit_id: { [Op.ne]: null } },
			attributes: ['id', 'name', 'unit_id', 'depCd'],
			order: [['name', 'ASC']],
		}),
		userVisibilityRepository.findByUserId(userId),
		userVisibilityRepository.findLastUpdatedAt(userId),
	]);

	// Build a quick-lookup set: "unit_id:dept_id" → selected
	const selectedSet = new Set(
		existingMappings.map((m) => `${m.unit_id}:${m.department_id}`),
	);

	// Group departments by unit_id
	const deptsByUnit = new Map();
	for (const dept of departments) {
		const list = deptsByUnit.get(dept.unit_id) ?? [];
		list.push({
			id: dept.id,
			name: dept.name,
			depCd: dept.depCd,
			selected: selectedSet.has(`${dept.unit_id}:${dept.id}`),
		});
		deptsByUnit.set(dept.unit_id, list);
	}

	const tree = units
		.map((unit) => ({
			id: unit.id,
			unitName: unit.unitName || unit.unit_name,
			unitCd: unit.unitCd,
			departments: deptsByUnit.get(unit.id) ?? [],
		}))
		.filter((unit) => unit.departments.length > 0); // only units that have departments

	return { units: tree, lastUpdatedAt: lastMapping ?? null };
};

const ADMIN_BYPASS_ROLES = ['super_admin', 'org_admin'];

/**
 * Returns the units and departments the current user is allowed to see.
 *
 * Admins get every unit/department in their org.
 * Regular users get only the pairs from their UserVisibilityMapping.
 *
 * @param {object} user - req.user
 * @returns {Promise<{ units, departments, mappings }>}
 */
exports.getMyVisibility = async (user) => {
	if (user.roles?.some((r) => ADMIN_BYPASS_ROLES.includes(r))) {
		const [units, departments] = await Promise.all([
			MasterUnit.findAll({
				where: { org_id: user.org_id },
				attributes: ['id', 'unitName', 'unitCd', 'unit_name'],
				order: [['unitName', 'ASC']],
			}),
			Department.findAll({
				where: { org_id: user.org_id, unit_id: { [Op.ne]: null } },
				attributes: ['id', 'name', 'unit_id', 'depCd', 'depName'],
				order: [['name', 'ASC']],
			}),
		]);
		const mappings = departments.map((d) => ({ unit_id: d.unit_id, department_id: d.id }));
		return {
			units: units.map((u) => ({ id: u.id, unitName: u.unitName || u.unit_name, unitCd: u.unitCd })),
			departments: departments.map((d) => ({ id: d.id, name: d.name, unit_id: d.unit_id, depCd: d.depCd })),
			mappings,
		};
	}

	const rawMappings = await userVisibilityRepository.findByUserId(user.id);
	if (rawMappings.length === 0) {
		return { units: [], departments: [], mappings: [] };
	}

	const unitIds = [...new Set(rawMappings.map((m) => m.unit_id))];
	const deptIds = [...new Set(rawMappings.map((m) => m.department_id))];

	const [units, departments] = await Promise.all([
		MasterUnit.findAll({
			where: { id: { [Op.in]: unitIds } },
			attributes: ['id', 'unitName', 'unitCd', 'unit_name'],
			order: [['unitName', 'ASC']],
		}),
		Department.findAll({
			where: { id: { [Op.in]: deptIds } },
			attributes: ['id', 'name', 'unit_id', 'depCd', 'depName'],
			order: [['name', 'ASC']],
		}),
	]);

	return {
		units: units.map((u) => ({ id: u.id, unitName: u.unitName || u.unit_name, unitCd: u.unitCd })),
		departments: departments.map((d) => ({ id: d.id, name: d.name, unit_id: d.unit_id, depCd: d.depCd, depName: d.depName })),
		mappings: rawMappings.map((m) => ({ unit_id: m.unit_id, department_id: m.department_id })),
	};
};

/**
 * Atomically replaces the user's visibility mappings.
 *
 * Validation:
 *   - userId must resolve to a real User.
 *   - Every (unit_id, department_id) pair must exist in the org to prevent
 *     an admin from accidentally granting access to another org's data.
 *
 * @param {number}      userId
 * @param {Array<{unit_id:number, department_id:number}>} mappings
 * @param {number}      orgId      - Admin's org (used for cross-org validation)
 * @param {number|null} createdBy  - Admin user id
 */
exports.saveVisibility = async (userId, mappings, orgId, createdBy) => {
	const user = await User.findByPk(userId, { attributes: ['id'] });
	if (!user) {
		throw new AppError('User not found', StatusCodes.NOT_FOUND);
	}

	if (!Array.isArray(mappings)) {
		throw new AppError('mappings must be an array', StatusCodes.BAD_REQUEST);
	}

	// Validate: unit_ids and department_ids must belong to the admin's org.
	if (mappings.length > 0) {
		const unitIds = [...new Set(mappings.map((m) => m.unit_id))];
		const deptIds = [...new Set(mappings.map((m) => m.department_id))];

		const [validUnits, validDepts] = await Promise.all([
			MasterUnit.findAll({
				where: { id: { [Op.in]: unitIds }, org_id: orgId },
				attributes: ['id'],
			}),
			Department.findAll({
				where: { id: { [Op.in]: deptIds }, org_id: orgId },
				attributes: ['id'],
			}),
		]);

		const validUnitIds = new Set(validUnits.map((u) => u.id));
		const validDeptIds = new Set(validDepts.map((d) => d.id));

		for (const m of mappings) {
			if (!validUnitIds.has(m.unit_id)) {
				throw new AppError(
					`Unit ID ${m.unit_id} does not exist in this organisation`,
					StatusCodes.BAD_REQUEST,
				);
			}
			if (!validDeptIds.has(m.department_id)) {
				throw new AppError(
					`Department ID ${m.department_id} does not exist in this organisation`,
					StatusCodes.BAD_REQUEST,
				);
			}
		}
	}

	const transaction = await sequelize.transaction();
	try {
		await userVisibilityRepository.replaceForUser(userId, mappings, createdBy, transaction);
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};
