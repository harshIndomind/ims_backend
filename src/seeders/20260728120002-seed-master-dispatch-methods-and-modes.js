'use strict';

/**
 * Seeds the default dispatch methods and acknowledgement modes. These are plain data
 * rows (not code), so new org-specific methods/modes (e.g. "WhatsApp", "Vendor Portal API")
 * can be added later via the master-data admin screen without another migration.
 */
module.exports = {
	async up(queryInterface, Sequelize) {
		const now = new Date();

		const existingMethods = await queryInterface.sequelize.query(
			`SELECT code FROM MasterDispatchMethods`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const existingMethodCodes = new Set(existingMethods.map((m) => m.code));

		const methods = [
			{ name: 'Email', code: 'email', requires_recipient_email: true, sort_order: 1 },
			{ name: 'Courier', code: 'courier', requires_recipient_email: false, sort_order: 2 },
			{ name: 'Hand Delivery', code: 'hand_delivery', requires_recipient_email: false, sort_order: 3 },
			// { name: 'Vendor Portal', code: 'vendor_portal', requires_recipient_email: false, sort_order: 4 },
			{ name: 'Other', code: 'other', requires_recipient_email: false, sort_order: 4 },
		]
			.filter((m) => !existingMethodCodes.has(m.code))
			.map((m) => ({ ...m, is_active: true, createdAt: now, updatedAt: now }));

		if (methods.length) {
			await queryInterface.bulkInsert('MasterDispatchMethods', methods);
		}

		const existingModes = await queryInterface.sequelize.query(
			`SELECT code FROM MasterAcknowledgementModes`,
			{ type: Sequelize.QueryTypes.SELECT },
		);
		const existingModeCodes = new Set(existingModes.map((m) => m.code));

		const modes = [
			{ name: 'Email', code: 'email', sort_order: 1 },
			{ name: 'Phone', code: 'phone', sort_order: 2 },
			// { name: 'Vendor Portal', code: 'portal', sort_order: 3 },
			{ name: 'Physical Copy', code: 'physical_copy', sort_order: 3 },
			{ name: 'Other', code: 'other', sort_order: 4 },
		]
			.filter((m) => !existingModeCodes.has(m.code))
			.map((m) => ({ ...m, is_active: true, createdAt: now, updatedAt: now }));

		if (modes.length) {
			await queryInterface.bulkInsert('MasterAcknowledgementModes', modes);
		}
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.bulkDelete('MasterDispatchMethods', {
			code: ['email', 'courier', 'hand_delivery', 'vendor_portal', 'other'],
		});
		await queryInterface.bulkDelete('MasterAcknowledgementModes', {
			code: ['email', 'phone', 'portal', 'physical_copy', 'other'],
		});
	},
};
