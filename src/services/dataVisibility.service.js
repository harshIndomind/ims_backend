/**
 * DataVisibilityService
 *
 * Centralises role-based data-visibility rules for list queries.
 * All visibility decisions live here so controllers and services stay clean.
 *
 * How it works
 * ────────────
 * super_admin / org_admin
 *   No filter — these roles see all records. Query params (unit_id, department_id)
 *   set by the caller are left untouched.
 *
 * All other roles — mapping-based
 *   1. Load the user's rows from UserVisibilityMappings.
 *   2. If rows exist → build a Sequelize Op.or condition from every
 *      (unit_id, department_id) pair and AND it into the where clause.
 *      Any unit_id / department_id already set by query params is captured
 *      first and used to intersect the mapping pairs, so the UI filter is
 *      respected while still enforcing the mapping boundary.
 *   3. If no rows exist or the intersection is empty → deny all access by
 *      injecting `literal('0 = 1')` — a user with no matching mappings sees zero records.
 *
 * Usage
 * ─────
 *   const dataVisibility = require('./dataVisibility.service');
 *
 *   // Generic — module param reserved for future per-module divergence
 *   await dataVisibility.apply(where, req.user, 'budget');
 *
 *   // Module-specific convenience wrappers
 *   await dataVisibility.applyBudgetVisibility(where, req.user);
 *   await dataVisibility.applyIndentVisibility(where, req.user);
 *
 * Extending to new modules
 * ────────────────────────
 *   Call `await dataVisibility.apply(where, req.user, 'work-order')` in the
 *   new service. No other changes required — the mapping-based filter already
 *   works generically because Budget, Indent, PO, WO, GRN etc. all share the
 *   same unit_id / department_id column names.
 */

const { Department, UserVisibilityMapping } = require('../models/index');
const { Op, literal } = require('sequelize');
const logger = require('../utils/logger');

/** Roles that bypass all visibility filters and see every record. */
const ADMIN_BYPASS_ROLES = ['super_admin', 'org_admin'];

// ─── Mapping-based filter (primary) ──────────────────────────────────────────

/**
 * Mutates `where` to restrict to only the (unit_id, department_id) pairs
 * explicitly granted to the user via UserVisibilityMappings.
 *
 * If the caller already placed a unit_id or department_id in `where` (from UI
 * filter selections), those values are captured and used to narrow the mapping
 * pairs before building the Op.or condition — so the UI filter is honoured
 * while still enforcing the user's mapping boundary.
 *
 * @param {object} where  - Sequelize where clause being built by the caller.
 * @param {object} user   - req.user
 * @returns {Promise<boolean>} true if mappings were found and applied.
 */
const applyMappingFilter = async (where, user) => {
	const mappings = await UserVisibilityMapping.findAll({
		where: { user_id: user.id },
		attributes: ['unit_id', 'department_id'],
	});

	if (mappings.length === 0) return false;

	// Capture explicit UI filter selections before removing them from `where`,
	// so we can intersect with mappings rather than silently discarding them.
	const preSelectedUnitId = where.unit_id ? Number(where.unit_id) : null;
	const preSelectedDeptId = where.department_id ? Number(where.department_id) : null;

	// Remove raw scalars — the mapping-based Op.or takes over.
	delete where.unit_id;
	delete where.department_id;

	// Build pairs, intersecting with any explicit unit/department the user chose.
	let pairs = mappings.map((m) => ({
		unit_id: m.unit_id,
		department_id: m.department_id,
	}));

	if (preSelectedUnitId) pairs = pairs.filter((p) => p.unit_id === preSelectedUnitId);
	if (preSelectedDeptId) pairs = pairs.filter((p) => p.department_id === preSelectedDeptId);

	if (pairs.length === 0) {
		// No mappings match the selected filters — deny all access.
		const existing = where[Op.and] ? [].concat(where[Op.and]) : [];
		where[Op.and] = [...existing, literal('0 = 1')];
		return true;
	}

	const existing = where[Op.and] ? [].concat(where[Op.and]) : [];
	where[Op.and] = [...existing, { [Op.or]: pairs }];

	return true;
};

// ─── dep_cd fallback (legacy, used when no mappings are configured yet) ───────

/**
 * Cross-unit department filter — the original visibility strategy.
 *
 * Finds every department_id whose depCd matches the user's dep_cd and
 * restricts queries to that set, giving consistent visibility across all
 * units that share the same logical department code.
 *
 * @param {object} where
 * @param {object} user
 */
const applyDepCdFallback = async (where, user) => {
	const { dep_cd, department_id } = user;

	if (dep_cd) {
		const siblings = await Department.findAll({
			where: { depCd: dep_cd },
			attributes: ['id'],
		});

		if (siblings.length > 0) {
			where.department_id = { [Op.in]: siblings.map((d) => d.id) };
		} else if (department_id) {
			where.department_id = department_id;
		}
	} else if (department_id) {
		where.department_id = department_id;
	}
};

// ─── Core mutator ────────────────────────────────────────────────────────────

/**
 * Applies the correct visibility filter to `where` for the given user.
 *
 * Mutates `where` in place (mirrors Sequelize's own convention — callers
 * build a `where` object and pass it to findAll).
 *
 * @param {object} where
 * @param {object} user
 * @returns {Promise<object>} The same `where` reference (for chaining).
 */
const applyVisibility = async (where, user) => {
	const roles = user.roles ?? [];

	// Admin bypass: super_admin and org_admin see everything.
	if (roles.some((r) => ADMIN_BYPASS_ROLES.includes(r))) {
		return where;
	}

	// Primary: explicit mapping-based filter.
	const mappingsApplied = await applyMappingFilter(where, user);

	// If no mappings exist for this user, deny all access rather than
	// falling back to dep_cd — a user with all mappings removed must see nothing.
	if (!mappingsApplied) {
		const existing = where[Op.and] ? [].concat(where[Op.and]) : [];
		where[Op.and] = [...existing, literal('0 = 1')];
	}

	return where;
};

// ─── Public API ──────────────────────────────────────────────────────────────

module.exports = {
	/**
	 * Generic entry point. The `module` parameter is reserved for future
	 * per-module divergence (e.g. GRN needs different rules than Indent).
	 */
	apply: (where, user, module) => applyVisibility(where, user),

	/** Convenience alias — Budget list queries. */
	applyBudgetVisibility: (where, user) => applyVisibility(where, user),

	/** Convenience alias — Indent list queries. */
	applyIndentVisibility: (where, user) => applyVisibility(where, user),
};
