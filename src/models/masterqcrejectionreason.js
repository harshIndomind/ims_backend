'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class MasterQcRejectionReason extends Model {
		static associate(models) {
			// none — referenced by qc_inspection_items.rejection_reason_id
		}
	}
	MasterQcRejectionReason.init(
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
			modelName: 'MasterQcRejectionReason',
			tableName: 'MasterQcRejectionReasons',
		},
	);
	return MasterQcRejectionReason;
};
