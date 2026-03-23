'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class GstStateCode extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// GstStateCode.hasMany(models.Address, {
			// 	foreignKey: 'state_id',
			// 	as: 'addresses',
			// });
		}
	}
	GstStateCode.init(
		{
			country_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Countries',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			gst_code: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: true,
			},
			gst_code_padded: {
				type: DataTypes.CHAR(2),
				allowNull: false,
			},
			state_name: {
				type: DataTypes.STRING(120),
				allowNull: false,
			},
			notes: {
				type: DataTypes.STRING(255),
				allowNull: true,
				defaultValue: null,
			},
		},
		{
			sequelize,
			modelName: 'GstStateCode',
		}
	);
	return GstStateCode;
};
