'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class organization extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	organization.init(
		{
			org_name: { type: DataTypes.STRING, allowNull: false },
			org_code: { type: DataTypes.STRING, allowNull: false, unique: true },
			org_email: { type: DataTypes.STRING, allowNull: false },
			org_person_name: { type: DataTypes.STRING, allowNull: false },
			org_person_contact: { type: DataTypes.STRING, allowNull: false },
			org_address: { type: DataTypes.STRING, allowNull: true },
		},
		{
			sequelize,
			modelName: 'organization',
		}
	);
	return organization;
};
