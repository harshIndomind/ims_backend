'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Indents', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			period_id: {
				type: Sequelize.INTEGER,
				references: {
					model: 'MasterPeriods',
					key: 'id',
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
				allowNull: false,
			},
			budgetType: {
				type: Sequelize.ENUM('item-wise', 'value-wise'),
			},
			unit_id: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			indent_no: {
				type: Sequelize.STRING(50),
				allowNull: true,
			},
			indent_date: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			department_id: {
				type: Sequelize.INTEGER,
				references: { model: 'departments', key: 'id' },
			},
			annexure: {
				type: Sequelize.STRING(200),
				allowNull: true,
			},
			remarks_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'IndentRemarks', key: 'id' },
			},
			is_drawing_required: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			drawing_details: {
				type: Sequelize.STRING(255),
				allowNull: true,
			},
			createdBy: {
				type: Sequelize.JSON,
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

	async down(queryInterface) {
		await queryInterface.dropTable('Indents');
	},
};
