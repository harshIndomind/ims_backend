'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('Products', {
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: Sequelize.INTEGER,
			},
			uniqueProductId: {
				type: Sequelize.STRING,
				allowNull: true,
				unique: true,
			},
			organization_id: {
				type: Sequelize.BIGINT,
			},
			tax_id: {
				type: Sequelize.BIGINT,
			},
			unit_id: {
				type: Sequelize.BIGINT,
			},
			// product_group_id: {
			//   type: Sequelize.BIGINT,
			//   allowNull: true,
			// },
			item_type: {
				type: Sequelize.ENUM(['product', 'service']),
			},
			name: {
				type: Sequelize.STRING,
			},
			product_note: {
				type: Sequelize.TEXT,
			},
			barcode_no: {
				type: Sequelize.STRING,
			},
			hsn_sac_code: {
				type: Sequelize.STRING,
			},
			cess_percent: {
				type: Sequelize.DECIMAL(10, 2),
			},
			cess_amount: {
				type: Sequelize.DECIMAL(10, 2),
			},
			cess_type: {
				type: Sequelize.ENUM(['fixed', 'per_unit']),
			},
			no_itc: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			stock_type: {
				type: Sequelize.ENUM(['normal', 'batch', 'serial']),
				defaultValue: 'normal',
			},
			available_qty: {
				type: Sequelize.DECIMAL(12, 2),
			},
			sell_price: {
				type: Sequelize.DECIMAL(12, 2),
			},
			sell_price_incl_tax: {
				type: Sequelize.DECIMAL(12, 2),
			},
			purchase_price: {
				type: Sequelize.DECIMAL(12, 2),
			},
			purchase_price_incl_tax: {
				type: Sequelize.DECIMAL(12, 2),
			},
			low_stock_alert: {
				type: Sequelize.DECIMAL(12, 2),
			},
			product_discount: {
				type: Sequelize.DECIMAL(12, 2),
			},
			product_discount_type: {
				type: Sequelize.ENUM(['rupee', 'percentage']),
			},
			product_images: {
				type: Sequelize.TEXT,
				allowNull: true,
			},
			is_manufactured: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			is_non_sellable: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			is_enabled: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
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
		try {
			await queryInterface.removeConstraint(
				'product_product_group',
				'product_product_group_ibfk_1'
			);
		} catch (e) {
			console.warn(
				'Constraint product_product_group_ibfk_1 not found, skipping...'
			);
		}

		await queryInterface.dropTable('Products');
	},
};
