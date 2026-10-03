'use strict';

// Reversing an APPROVED Purchase Invoice (purchase-invoice.service.js cancelApprovedPurchaseInvoice)
// is its own permission action, deliberately separate from ordinary 'cancel' (which only ever
// applies to draft/in-progress invoices) — held by the same roles that can approve invoices.
const ACTION = 'cancel_approved';
const ROLES = ['org_admin', 'purchase_invoice_approver'];

module.exports = {
	async up(queryInterface, Sequelize) {
		const [menu] = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'purchase-invoice' LIMIT 1`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!menu) return;

		let [perm] = await queryInterface.sequelize.query(`SELECT id FROM Permissions WHERE menu_id = ? AND action = ?`, {
			replacements: [menu.id, ACTION],
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!perm) {
			await queryInterface.bulkInsert('Permissions', [
				{ menu_id: menu.id, action: ACTION, createdAt: new Date(), updatedAt: new Date() },
			]);
			[perm] = await queryInterface.sequelize.query(`SELECT id FROM Permissions WHERE menu_id = ? AND action = ?`, {
				replacements: [menu.id, ACTION],
				type: Sequelize.QueryTypes.SELECT,
			});
		}

		const roles = await queryInterface.sequelize.query(`SELECT id FROM Roles WHERE code IN (:codes)`, {
			replacements: { codes: ROLES },
			type: Sequelize.QueryTypes.SELECT,
		});
		if (roles.length) {
			await queryInterface.bulkInsert(
				'role_permissions',
				roles.map((r) => ({ role_id: r.id, permission_id: perm.id })),
				{ ignoreDuplicates: true },
			);
		}
	},

	async down(queryInterface, Sequelize) {
		const [menu] = await queryInterface.sequelize.query(`SELECT id FROM Menus WHERE slug = 'purchase-invoice' LIMIT 1`, {
			type: Sequelize.QueryTypes.SELECT,
		});
		if (!menu) return;
		await queryInterface.sequelize.query(
			`DELETE rp FROM role_permissions rp JOIN Permissions p ON rp.permission_id = p.id WHERE p.menu_id = ? AND p.action = ?`,
			{ replacements: [menu.id, ACTION] },
		);
		await queryInterface.bulkDelete('Permissions', { menu_id: menu.id, action: ACTION }, {});
	},
};
