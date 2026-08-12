'use strict';

/**
 * Seeds default QC rejection reasons. Plain data rows, not code — new org-specific reasons
 * can be added later via a master-data admin screen without another migration.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const existing = await queryInterface.sequelize.query(`SELECT code FROM MasterQcRejectionReasons`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingCodes = new Set(existing.map((r) => r.code));

		const reasons = [
			{ name: 'Damaged in transit', code: 'damaged_in_transit', sort_order: 1 },
			{ name: 'Wrong item / mismatch', code: 'wrong_item', sort_order: 2 },
			{ name: 'Below specification', code: 'below_specification', sort_order: 3 },
			{ name: 'Quantity shortage', code: 'quantity_shortage', sort_order: 4 },
			{ name: 'Expired / near-expiry', code: 'expired', sort_order: 5 },
			{ name: 'Packaging defect', code: 'packaging_defect', sort_order: 6 },
			{ name: 'Other', code: 'other', sort_order: 7 },
		]
			.filter((r) => !existingCodes.has(r.code))
			.map((r) => ({ ...r, is_active: true, createdAt: now, updatedAt: now }));

		if (reasons.length) {
			await queryInterface.bulkInsert('MasterQcRejectionReasons', reasons);
		}
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('MasterQcRejectionReasons', {
			code: [
				'damaged_in_transit',
				'wrong_item',
				'below_specification',
				'quantity_shortage',
				'expired',
				'packaging_defect',
				'other',
			],
		});
	},
};
