'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('ProductSerials', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			product_id: {
				type: Sequelize.BIGINT,
			},
			serial_no: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			sell_price: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: true,
			},
			sell_price_incl_tax: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: true,
			},
			purchase_price: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: true,
			},
			purchase_price_incl_tax: {
				type: Sequelize.DECIMAL(12, 2),
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('ProductSerials');
	},
};
