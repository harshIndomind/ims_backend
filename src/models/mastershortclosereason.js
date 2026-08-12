'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterShortCloseReason extends Model {
		static associate(models) {
			// none — referenced by short_close_requests.reason_id
		}
	}
	MasterShortCloseReason.init(
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
			modelName: 'MasterShortCloseReason',
			tableName: 'MasterShortCloseReasons',
		},
	);
	return MasterShortCloseReason;
};
