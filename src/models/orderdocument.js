'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OrderDocument extends Model {
		static associate(models) {
			// polymorphic via (context, context_id) — no FK/association, matching AuditLog's style
		}
	}
	OrderDocument.init(
		{
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			document_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			context: {
				type: DataTypes.ENUM('dispatch', 'acknowledgement'),
				allowNull: false,
			},
			context_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			file_name: {
				type: DataTypes.STRING(255),
				allowNull: false,
			},
			file_key: {
				type: DataTypes.STRING(500),
				allowNull: false,
			},
			file_type: {
				type: DataTypes.STRING(100),
				allowNull: false,
			},
			file_size: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			storage_type: {
				type: DataTypes.ENUM('s3', 'local'),
				defaultValue: 's3',
			},
			uploaded_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'OrderDocument',
			tableName: 'order_documents',
		},
	);
	return OrderDocument;
};
