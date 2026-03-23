'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		// 1️⃣ Remove old FK if exists
		await queryInterface
			.removeConstraint('Budgets', 'fk_budgets_department')
			.catch(() => {});

		// 2️⃣ Change datatype
		await queryInterface.changeColumn('Budgets', 'department_id', {
			type: Sequelize.INTEGER,
			allowNull: false,
		});

		// 3️⃣ Add FK
		await queryInterface.addConstraint('Budgets', {
			fields: ['department_id'],
			type: 'foreign key',
			name: 'fk_budgets_department',
			references: {
				table: 'departments',
				field: 'id',
			},
			onDelete: 'CASCADE',
			onUpdate: 'CASCADE',
		});
	},

	async down(queryInterface, Sequelize) {
		const constraints =
			await queryInterface.getForeignKeyReferencesForTable('Budgets');
    console.log("constraints ", constraints);
    
		for (const constraint of constraints) {
			if (constraint.columnName === 'department_id') {
				await queryInterface.removeConstraint(
					'Budgets',
					constraint.constraintName,
				);
			}
		}

		await queryInterface.changeColumn('Budgets', 'department_id', {
			type: Sequelize.STRING(50),
			allowNull: true,
		});
	},
};
