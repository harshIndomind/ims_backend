'use strict';
const { Model } = require('sequelize');

const DEDUCTION_TYPES = ['TDS', 'GST_TDS', 'WCT'];
const STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

module.exports = (sequelize, DataTypes) => {
	class TdsLiability extends Model {
		static associate(models) {
			TdsLiability.belongsTo(models.PaymentRequisition, {
				foreignKey: 'payment_requisition_id',
				as: 'paymentRequisition',
			});
			TdsLiability.belongsTo(models.PaymentRequisitionDeduction, {
				foreignKey: 'payment_requisition_deduction_id',
				as: 'deduction',
			});
			TdsLiability.belongsTo(models.PurchaseOrder, {
				foreignKey: 'po_id',
				as: 'purchaseOrder',
			});
			TdsLiability.belongsTo(models.WorkOrder, {
				foreignKey: 'wo_id',
				as: 'workOrder',
			});
			TdsLiability.hasMany(models.TdsSettlementAllocation, {
				foreignKey: 'tds_liability_id',
				as: 'allocations',
			});
		}
	}

	TdsLiability.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			source_type: {
				type: DataTypes.ENUM('PO', 'WO'),
				allowNull: false,
			},
			po_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			wo_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			payment_requisition_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			payment_requisition_deduction_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: true,
			},
			vendor_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			vendor_snapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			deduction_type: {
				type: DataTypes.ENUM(...DEDUCTION_TYPES),
				allowNull: false,
			},
			section_code: {
				type: DataTypes.STRING(20),
				allowNull: true,
			},
			base_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			tds_percentage: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
			},
			tds_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			amount_settled: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			status: {
				type: DataTypes.ENUM(...STATUSES),
				allowNull: false,
				defaultValue: 'UNPAID',
			},
			liability_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			cancelled_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			cancelled_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			cancellation_reason: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			created_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			updated_by_id: {
				type: DataTypes.INTEGER,
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
			modelName: 'TdsLiability',
		},
	);

	return TdsLiability;
};

module.exports.DEDUCTION_TYPES = DEDUCTION_TYPES;
module.exports.STATUSES = STATUSES;
