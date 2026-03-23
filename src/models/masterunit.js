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
		}
	}
	MasterUnit.init(
		{
			org_id: DataTypes.INTEGER,
			unit_name: DataTypes.STRING,
			unit_short_name: DataTypes.STRING,
		},
		{
			sequelize,
			modelName: 'MasterUnit',
		},
	);
	return MasterUnit;
};
