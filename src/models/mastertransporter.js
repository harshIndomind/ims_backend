'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterTransporter extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// define association here
		}
	}
	MasterTransporter.init(
		{
			name: DataTypes.STRING,
			address1: {
				type: DataTypes.TEXT,
			},
			address2: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			contactNo: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'MasterTransporter',
		},
	);
	return MasterTransporter;
};
