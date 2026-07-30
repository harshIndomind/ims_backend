'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterAcknowledgementMode extends Model {
		static associate(models) {
			// none — referenced by order_acknowledgements.acknowledgement_mode_id
		}
	}
	MasterAcknowledgementMode.init(
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
			modelName: 'MasterAcknowledgementMode',
			tableName: 'MasterAcknowledgementModes',
		},
	);
	return MasterAcknowledgementMode;
};
