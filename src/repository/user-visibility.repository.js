const { UserVisibilityMapping } = require('../models/index');
const { fn, col } = require('sequelize');

/**
 * Returns all visibility mappings for a user.
 * @param {number} userId
 * @returns {Promise<UserVisibilityMapping[]>}
 */
exports.findByUserId = (userId) => {
	return UserVisibilityMapping.findAll({
		where: { user_id: userId },
		attributes: ['unit_id', 'department_id'],
	});
};

/**
 * Returns the most recent updatedAt timestamp for a user's mappings, or null.
 * @param {number} userId
 * @returns {Promise<Date|null>}
 */
exports.findLastUpdatedAt = async (userId) => {
	const row = await UserVisibilityMapping.findOne({
		where: { user_id: userId },
		attributes: [[fn('MAX', col('updatedAt')), 'lastUpdatedAt']],
		raw: true,
	});
	return row?.lastUpdatedAt ?? null;
};

/**
 * Atomically replaces all visibility mappings for a user.
 *
 * Deletes existing rows, then bulk-inserts the new set inside the provided
 * transaction so callers can roll back on any downstream failure.
 *
 * @param {number}      userId
 * @param {Array<{unit_id:number, department_id:number}>} mappings
 * @param {number|null} createdBy
 * @param {object}      transaction  - Sequelize transaction
 */
exports.replaceForUser = async (userId, mappings, createdBy, transaction) => {
	await UserVisibilityMapping.destroy({
		where: { user_id: userId },
		transaction,
	});

	if (mappings.length === 0) return;

	const now = new Date();
	const rows = mappings.map(({ unit_id, department_id }) => ({
		user_id: userId,
		unit_id,
		department_id,
		created_by: createdBy ?? null,
		createdAt: now,
		updatedAt: now,
	}));

	await UserVisibilityMapping.bulkCreate(rows, { transaction });
};
