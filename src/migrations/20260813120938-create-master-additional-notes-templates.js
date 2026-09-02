'use strict';
module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable('MasterAdditionalNotesTemplates', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			type: {
				type: Sequelize.ENUM('PO', 'WO', 'BOTH'),
				allowNull: false,
			},
			vendor_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			vendor_name: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			notes: {
				type: Sequelize.JSON,
				allowNull: false,
				defaultValue: [],
			},
			is_active: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
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

		await queryInterface.addIndex('MasterAdditionalNotesTemplates', [
			'vendor_id',
			'type',
		]);
	},
	down: async (queryInterface) => {
		await queryInterface.dropTable('MasterAdditionalNotesTemplates');
	},
};