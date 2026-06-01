'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterUnit extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			MasterUnit.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			MasterUnit.hasMany(models.Budget, {
				foreignKey: 'unit_id',
				as: 'budgets',
			});
			MasterUnit.hasMany(models.Indent, {
				foreignKey: 'unit_id',
				as: 'indents',
			});
		}
	}
	MasterUnit.init(
		{
			org_id: DataTypes.INTEGER,
			unit_name: DataTypes.STRING,
			unit_short_name: DataTypes.STRING,
			unitCd: {
				type: DataTypes.INTEGER,
				allowNull: true,
				defaultValue: 0,
			},
			unitName: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			lock: {
				type: DataTypes.BOOLEAN,
				allowNull: true,
				defaultValue: false,
			},
			masterUnitid: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'MasterUnit',
		},
	);
	return MasterUnit;
};
