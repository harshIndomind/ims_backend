'use strict';

/**
 * Seeds default Other Charge types (freight/loading/etc. billed alongside a
 * Purchase Invoice but not part of the PO's own ordered value). Plain data
 * rows, not code — new org-specific types can be added later via a
 * master-data admin screen without another migration.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const existing = await queryInterface.sequelize.query(`SELECT code FROM MasterOtherChargeTypes`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingCodes = new Set(existing.map((r) => r.code));

		const types = [
			{ name: 'Transportation', code: 'transportation', sort_order: 1 },
			{ name: 'Loading / Unloading', code: 'loading_unloading', sort_order: 2 },
			{ name: 'Packing & Forwarding', code: 'packing_forwarding', sort_order: 3 },
			{ name: 'Insurance', code: 'insurance', sort_order: 4 },
			{ name: 'Other', code: 'other', sort_order: 5 },
		]
			.filter((t) => !existingCodes.has(t.code))
			.map((t) => ({ ...t, is_active: true, createdAt: now, updatedAt: now }));

		if (types.length) {
			await queryInterface.bulkInsert('MasterOtherChargeTypes', types);
		}
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('MasterOtherChargeTypes', {
			code: ['transportation', 'loading_unloading', 'packing_forwarding', 'insurance', 'other'],
		});
	},
};
