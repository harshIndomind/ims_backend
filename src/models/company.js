'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Company extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	Company.init(
		{
			name: { type: DataTypes.STRING, allowNull: false },
			description: DataTypes.TEXT,
			address: DataTypes.TEXT,
			contact_no: { type: DataTypes.STRING, allowNull: false },
			alt_contact_no: DataTypes.STRING,
		},
		{
			sequelize,
			modelName: 'Company',
		}
	);

	Company.associate = (models) => {
		// Company.hasMany(models.User, {
		// 	foreignKey: 'companyId',
		// });
	};
	return Company;
};
