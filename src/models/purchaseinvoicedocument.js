'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseInvoiceDocument extends Model {
		static associate(models) {
			PurchaseInvoiceDocument.belongsTo(models.PurchaseInvoice, {
				foreignKey: 'purchase_invoice_id',
				as: 'purchaseInvoice',
			});
		}
	}
	PurchaseInvoiceDocument.init(
		{
			purchase_invoice_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'purchase_invoices',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
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
			createdAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			updatedAt: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			sequelize,
			modelName: 'PurchaseInvoiceDocument',
			tableName: 'purchase_invoice_documents',
		},
	);
	return PurchaseInvoiceDocument;
};
