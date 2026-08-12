'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class ShortCloseRequest extends Model {
		static associate(models) {
			ShortCloseRequest.hasMany(models.ShortCloseRequestItem, {
				foreignKey: 'short_close_request_id',
				as: 'items',
			});
			ShortCloseRequest.belongsTo(models.MasterShortCloseReason, {
				foreignKey: 'reason_id',
				as: 'reason',
			});
		}
	}
	ShortCloseRequest.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			request_no: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			document_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			status: {
				type: DataTypes.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
			},
			reason_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			requested_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			requested_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			approved_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			approved_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'ShortCloseRequest',
			tableName: 'short_close_requests',
		},
	);
	return ShortCloseRequest;
};
