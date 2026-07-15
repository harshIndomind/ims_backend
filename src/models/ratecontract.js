'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class RateContract extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			RateContract.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			RateContract.hasMany(models.RateContractUnitSupplier, {
				foreignKey: 'rate_contract_id',
				as: 'unit_supplier_mapping',
			});
			RateContract.hasMany(models.RateContractUnitItem, {
				foreignKey: 'rate_contract_id',
				as: 'unit_product_mapping',
			});
			RateContract.hasMany(models.RateContractProduct, {
				foreignKey: 'rate_contract_id',
				as: 'products',
			});
			RateContract.belongsTo(models.RateContract, {
				foreignKey: 'parent_rc_id',
				as: 'parentRateContract',
			});
			RateContract.hasMany(models.PurchaseOrderItem, {
				foreignKey: 'rate_contract_id',
				as: 'purchaseOrderItems',
			});
		}
	}
	RateContract.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			supplier_id: {
				type: DataTypes.INTEGER,
			},
			supplierSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			product_id: {
				type: DataTypes.INTEGER,
			},
			productSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			contract_subject: {
				type: DataTypes.STRING,
			},
			universal_code: {
				type: DataTypes.STRING,
			},
			uom_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			specification: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			contract_rate: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			discount: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			special_discount: {
				type: DataTypes.DOUBLE,
				defaultValue: 0,
			},
			special_discount_details: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			effective_date: {
				type: DataTypes.DATEONLY,
			},
			end_date: {
				type: DataTypes.DATEONLY,
			},
			price_term_id: {
				type: DataTypes.INTEGER,
			},
			gst_term_id: {
				type: DataTypes.INTEGER,
			},
			payment_term_id: {
				type: DataTypes.INTEGER,
			},
			delivery_term_id: {
				type: DataTypes.INTEGER,
			},
			pf_term_id: {
				type: DataTypes.INTEGER,
			},
			ld_clause_term_id: {
				type: DataTypes.INTEGER,
			},
			dispatch_id: {
				type: DataTypes.INTEGER,
			},
			others: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('draft', 'approved', 'superseded', 'expired', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			family_number: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			version_number: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 1,
			},
			parent_rc_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			superseded_by_rc_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			approved_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			approved_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'RateContract',
		},
	);
	return RateContract;
};
