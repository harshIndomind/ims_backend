'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('PaymentRequisitions', 'po_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'PurchaseOrders', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
			after: 'supplier_id',
		});
		await queryInterface.addColumn('PaymentRequisitions', 'wo_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'WorkOrders', key: 'id' },
			onUpdate: 'CASCADE',
			onDelete: 'SET NULL',
			after: 'po_id',
		});
		await queryInterface.addColumn('PaymentRequisitions', 'supplier_snapshot', {
			type: Sequelize.JSON,
			allowNull: true,
			after: 'supplier_id',
		});
	},

	async down(queryInterface) {
		await queryInterface.removeColumn('PaymentRequisitions', 'po_id');
		await queryInterface.removeColumn('PaymentRequisitions', 'wo_id');
		await queryInterface.removeColumn('PaymentRequisitions', 'supplier_snapshot');
	},
};
