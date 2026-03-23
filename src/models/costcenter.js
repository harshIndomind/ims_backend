'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class CostCenter extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			CostCenter.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			CostCenter.belongsTo(models.MasterAccount, {
				foreignKey: 'account_id',
				as: 'account',
			});
		}
	}
	CostCenter.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			code: {
				type: DataTypes.STRING(10),
				allowNull: false,
				unique: true,
			},

			name: {
				type: DataTypes.STRING(100),
				allowNull: false,
			},

			station_code: {
				type: DataTypes.STRING,
				allowNull: true,
			},

			account_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},

			is_lock: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
		},
		{
			sequelize,
			paranoid: true,
			timestamps: true,
			modelName: 'CostCenter',
			tableName: 'cost_centers'
		},
	);
	return CostCenter;
};
