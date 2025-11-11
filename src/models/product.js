'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Product extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Product.belongsTo(models.organization, {
				foreignKey: 'organization_id',
				as: 'organization',
			});

			Product.belongsTo(models.Tax, {
				foreignKey: 'tax_id',
				as: 'tax',
			});

			Product.belongsTo(models.Unit, {
				foreignKey: 'unit_id',
				as: 'unit',
			});

			Product.belongsToMany(models.ProductGroup, {
				through: 'product_product_group', // pivot table
				foreignKey: 'product_id',
				otherKey: 'product_group_id',
				as: 'product_groups',
			});
			// For Batch or Serial data (if stored separately)
			Product.hasMany(models.ProductBatch, {
				foreignKey: 'product_id',
				as: 'batches',
			});

			Product.hasMany(models.ProductSerial, {
				foreignKey: 'product_id',
				as: 'serials',
			});

			Product.hasMany(models.ProductUOM, {
				foreignKey: 'product_id',
				as: 'uoms',
			});

			Product.hasMany(models.InvoiceItem, {
				foreignKey: 'product_id',
				as: 'invoiceItems',
				onDelete: 'CASCADE',
			});
		}
	}
	Product.init(
		{
			uniqueProductId: {
				type: DataTypes.STRING,
				allowNull: true,
				unique: true,
			},
			organization_id: DataTypes.INTEGER,
			tax_id: DataTypes.INTEGER,
			unit_id: DataTypes.INTEGER,
			item_type: DataTypes.STRING,
			name: DataTypes.STRING,
			product_note: DataTypes.TEXT,
			barcode_no: DataTypes.STRING,
			hsn_sac_code: DataTypes.STRING,
			cess_percent: {
				type: DataTypes.DECIMAL(10, 2),
			},
			cess_amount: {
				type: DataTypes.DECIMAL(10, 2),
			},
			cess_type: {
				type: DataTypes.ENUM(['fixed', 'per_unit']),
			},
			no_itc: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			stock_type: {
				type: DataTypes.ENUM(['normal', 'batch', 'serial']),
				defaultValue: 'normal',
			},
			available_qty: {
				type: DataTypes.DECIMAL(12, 2),
			},
			sell_price: {
				type: DataTypes.DECIMAL(12, 2),
			},
			sell_price_incl_tax: {
				type: DataTypes.DECIMAL(12, 2),
			},
			purchase_price: {
				type: DataTypes.DECIMAL(12, 2),
			},
			purchase_price_incl_tax: {
				type: DataTypes.DECIMAL(12, 2),
			},
			low_stock_alert: {
				type: DataTypes.DECIMAL(12, 2),
			},
			product_discount: {
				type: DataTypes.DECIMAL(12, 2),
			},
			product_discount_type: {
				type: DataTypes.ENUM(['rupee', 'percentage']),
			},
			product_images: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			is_manufactured: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			is_non_sellable: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			is_enabled: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
		},
		{
			sequelize,
			modelName: 'Product',
		}
	);
	return Product;
};
