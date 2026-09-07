'use strict';

/**
 * Adds TCS and Discount to the Other Charge types catalog — these used to be
 * two free-text, unpersisted "customField1"/"customField2" slots on the
 * Purchase Invoice form; that functionality now lives in Other Charges
 * instead (rupee/percentage + sign, see 20260903180000's value_type/
 * operation_type columns), so these need a real catalog entry each rather
 * than being retyped by hand every time.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const existing = await queryInterface.sequelize.query(`SELECT code FROM MasterOtherChargeTypes`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		const existingCodes = new Set(existing.map((r) => r.code));

		const types = [
			{ name: 'TCS', code: 'tcs', sort_order: 6 },
			{ name: 'Discount', code: 'discount', sort_order: 7 },
		]
			.filter((t) => !existingCodes.has(t.code))
			.map((t) => ({ ...t, is_active: true, createdAt: now, updatedAt: now }));

		if (types.length) {
			await queryInterface.bulkInsert('MasterOtherChargeTypes', types);
		}
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('MasterOtherChargeTypes', {
			code: ['tcs', 'discount'],
		});
	},
};
