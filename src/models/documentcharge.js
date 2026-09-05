'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class DocumentCharge extends Model {
		static associate(models) {
			// Polymorphic — no formal belongsTo, same convention as ShortCloseRequestItem.po_wo_item_id.
		}
	}
	DocumentCharge.init(
		{
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			document_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			calculation_type: {
				type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
				allowNull: false,
			},
			value: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			operation: {
				type: DataTypes.ENUM('+', '-'),
				allowNull: false,
				defaultValue: '+',
			},
			apply_on: {
				type: DataTypes.ENUM('NET_TAXABLE_AMOUNT', 'AFTER_TAX'),
				allowNull: false,
				defaultValue: 'AFTER_TAX',
			},
			tax_treatment: {
				type: DataTypes.ENUM('NON_TAXABLE', 'SPECIFIC_RATE', 'INHERIT_ITEM_TAX'),
				allowNull: false,
				defaultValue: 'NON_TAXABLE',
			},
			tax_rate: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
			},
			sequence: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
			taxable_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			cgst: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			sgst: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			igst: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			cess: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
		},
		{
			sequelize,
			modelName: 'DocumentCharge',
			tableName: 'document_charges',
		},
	);
	return DocumentCharge;
};
