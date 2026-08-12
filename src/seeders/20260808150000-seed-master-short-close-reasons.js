'use strict';

/**
 * Seeds default Short Close reasons. Plain data rows, not code — new org-specific reasons
 * can be added later via a master-data admin screen without another migration.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const existing = await queryInterface.sequelize.query(`SELECT code FROM MasterShortCloseReasons`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingCodes = new Set(existing.map((r) => r.code));

		const reasons = [
			{ name: 'Vendor unable to supply', code: 'vendor_unable_to_supply', sort_order: 1 },
			{ name: 'No longer required', code: 'not_required', sort_order: 2 },
			{ name: 'Order raised in error', code: 'order_error', sort_order: 3 },
			{ name: 'Rejected quantity — replacement not required', code: 'rejection_not_replaced', sort_order: 4 },
			{ name: 'Budget/indent revised', code: 'budget_revised', sort_order: 5 },
			{ name: 'Other', code: 'other', sort_order: 6 },
		]
			.filter((r) => !existingCodes.has(r.code))
			.map((r) => ({ ...r, is_active: true, createdAt: now, updatedAt: now }));

		if (reasons.length) {
			await queryInterface.bulkInsert('MasterShortCloseReasons', reasons);
		}
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('MasterShortCloseReasons', {
			code: [
				'vendor_unable_to_supply',
				'not_required',
				'order_error',
				'rejection_not_replaced',
				'budget_revised',
				'other',
			],
		});
	},
};
