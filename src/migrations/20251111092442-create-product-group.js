'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('product_product_group', {
			createdAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			product_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'Products', // 👈 must match your actual table name
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			product_group_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: {
					model: 'ProductGroups', // 👈 must match your actual table name
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
		});

		// Add composite primary key
		await queryInterface.addConstraint('product_product_group', {
			fields: ['product_id', 'product_group_id'],
			type: 'primary key',
			name: 'pk_product_product_group',
		});

		// Add index for faster lookups by product_group_id
		await queryInterface.addIndex('product_product_group', [
			'product_group_id',
		]);
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.dropTable('product_product_group');
	},
};
