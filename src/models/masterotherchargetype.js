'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterOtherChargeType extends Model {
		static associate(models) {
			// none — referenced by purchase_invoice_charges.charge_type_id
		}
	}
	MasterOtherChargeType.init(
		{
			name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			code: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: true,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			sort_order: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
		},
		{
			sequelize,
			modelName: 'MasterOtherChargeType',
			tableName: 'MasterOtherChargeTypes',
		},
	);
	return MasterOtherChargeType;
};
