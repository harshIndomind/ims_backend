'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterDispatchMethod extends Model {
		static associate(models) {
			// none — referenced by order_dispatches.dispatch_method_id
		}
	}
	MasterDispatchMethod.init(
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
			requires_recipient_email: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
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
			modelName: 'MasterDispatchMethod',
			tableName: 'MasterDispatchMethods',
		},
	);
	return MasterDispatchMethod;
};
