'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class PaymentRequisition extends Model {
		static associate(models) {
			PaymentRequisition.belongsTo(models.User, {
				foreignKey: 'fed_by_id',
				as: 'fedBy',
			});
			PaymentRequisition.belongsTo(models.User, {
				foreignKey: 'authorized_by_id',
				as: 'authorizedBy',
			});
			PaymentRequisition.belongsTo(models.PurchaseOrder, {
				foreignKey: 'po_id',
				as: 'purchaseOrder',
			});
			PaymentRequisition.belongsTo(models.WorkOrder, {
				foreignKey: 'wo_id',
				as: 'workOrder',
			});
			PaymentRequisition.belongsTo(models.CostCenter, {
				foreignKey: 'cost_center_id',
				as: 'cost_center',
			});
			PaymentRequisition.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'payment_term_id',
				as: 'terms',
			});
			PaymentRequisition.hasMany(models.PaymentRequisitionDeduction, {
				foreignKey: 'payment_requisition_id',
				as: 'deductions',
			});
			PaymentRequisition.hasMany(models.TdsLiability, {
				foreignKey: 'payment_requisition_id',
				as: 'tdsLiabilities',
			});
		}
	}

	PaymentRequisition.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			requisition_no: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			requisition_date: {
				type: DataTypes.DATE,
				allowNull: false,
			},
			requisition_against: {
				type: DataTypes.ENUM('WO', 'PO', 'Invoice'),
				allowNull: false,
				defaultValue: 'WO',
			},
			requisition_type: {
				type: DataTypes.ENUM('REGULAR', 'RETENTION_RELEASE'),
				allowNull: false,
				defaultValue: 'REGULAR',
			},
			supplier_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			supplier_snapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			bank_details_snapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			cost_center_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'cost_centers', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			po_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'PurchaseOrders', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			wo_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'WorkOrders', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
			wo_no: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			po_wo_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			wo_po_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: true,
				defaultValue: 0,
			},
			requisition_value_percent: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: false,
				defaultValue: 0,
			},
			requisition_amount: {
				// @deprecated — use gross_amount on new records; kept for backward compat
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			gross_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_deductions: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			net_payable: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			tds_percent: {
				// @deprecated — use deductions child rows; kept for backward compat
				type: DataTypes.DECIMAL(5, 2),
				allowNull: false,
				defaultValue: 0,
			},
			tds_amount: {
				// @deprecated — use deductions child rows; kept for backward compat
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			total_amount: {
				// @deprecated — use net_payable; kept for backward compat
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			project_code: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			project_name: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			activity_id: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			budget_id: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			fed_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			fed_by: {
				type: DataTypes.JSON,
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
			authorized_by_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			authorized_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			authorized_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			payment_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			remark: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			term_condition: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			payment_term_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			payment_type: {
				type: DataTypes.ENUM('CASH', 'NEFT', 'UPI', 'IMPS', 'RTGS', 'CHEQUE'),
				allowNull: true,
			},
			transaction_id: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
				allowNull: false,
				defaultValue: 'PENDING',
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
			modelName: 'PaymentRequisition',
		},
	);

	return PaymentRequisition;
};
