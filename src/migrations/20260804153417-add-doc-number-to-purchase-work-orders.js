'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		for (const table of ['PurchaseOrders', 'WorkOrders']) {
			await queryInterface.addColumn(table, 'doc_number', {
				type: Sequelize.STRING(100),
				allowNull: true,
				unique: true,
			});
			await queryInterface.addColumn(table, 'doc_sequence_no', {
				type: Sequelize.INTEGER,
				allowNull: true,
			});
			await queryInterface.addColumn(table, 'doc_fiscal_year', {
				type: Sequelize.STRING(7),
				allowNull: true,
			});
		}

		await queryInterface.changeColumn('PurchaseOrders', 'poNo', {
			type: Sequelize.STRING,
			unique: true,
			allowNull: true,
		});
		await queryInterface.changeColumn('WorkOrders', 'woNo', {
			type: Sequelize.STRING,
			unique: true,
			allowNull: true,
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.changeColumn('PurchaseOrders', 'poNo', {
			type: Sequelize.STRING,
			unique: true,
			allowNull: false,
		});
		await queryInterface.changeColumn('WorkOrders', 'woNo', {
			type: Sequelize.STRING,
			unique: true,
			allowNull: false,
		});

		for (const table of ['PurchaseOrders', 'WorkOrders']) {
			await queryInterface.removeColumn(table, 'doc_fiscal_year');
			await queryInterface.removeColumn(table, 'doc_sequence_no');
			await queryInterface.removeColumn(table, 'doc_number');
		}
	},
};
