'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Country extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// Country.hasMany(models.GstStateCode, {
			// 	foreignKey: 'country_id',
			// 	as: 'states',
			// });
			Country.hasMany(models.Address, {
				foreignKey: 'country_id',
				as: 'addresses',
			});
		}
	}
	Country.init(
		{
			name: DataTypes.STRING,
		},
		{
			sequelize,
			tableName: 'Countries',
			modelName: 'Country',
		}
	);
	return Country;
};
