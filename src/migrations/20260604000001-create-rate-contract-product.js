'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('RateContractProducts', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			rate_contract_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'RateContracts',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			productSnapshot: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			uom_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			contract_rate: {
				type: Sequelize.DOUBLE,
				defaultValue: 0,
			},
			special_discount: {
				type: Sequelize.DOUBLE,
				defaultValue: 0,
			},
			special_discount_details: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
				defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
			},
		});
	},
	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('RateContractProducts');
	},
};
