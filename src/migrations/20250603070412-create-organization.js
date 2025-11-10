'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('organizations', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			org_name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_code: {
				type: Sequelize.STRING,
				allowNull: false,
				unique: true,
			},
			is_gst_registered: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			org_gst_number: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			update_gst_on_invoices: {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			pan: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			org_email: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_person_name: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_person_contact: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			org_address: {
				type: Sequelize.STRING,
				allowNull: false,
			},
			pincode: {
				type: Sequelize.INTEGER,
				allowNull: true,
			},
			state: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			city: {
				type: Sequelize.STRING,
				allowNull: true,
			},
			// plan_id: {
			// 	type: Sequelize.INTEGER,
			// 	allowNull: true,
			// 	references: {
			// 		model: 'Plans',
			// 		key: 'id',
			// 	},
			// 	onUpdate: 'SET NULL',
			// 	onDelete: 'SET NULL',
			// },
			// plan_expiry_date: {
			// 	type: Sequelize.DATE,
			// 	allowNull: true,
			// },
			// features: {
			// 	type: Sequelize.JSON,
			// 	allowNull: true,
			// 	defaultValue: {},
			// },
			status: {
				type: Sequelize.ENUM('active', 'inactive', 'suspended'),
				defaultValue: 'active',
			},
			createdBy: {
				type: Sequelize.INTEGER,
				allowNull: false,
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
		await queryInterface.dropTable('organizations');
	},
};
