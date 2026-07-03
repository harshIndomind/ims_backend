'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class WorkOrder extends Model {
		static associate(models) {
			WorkOrder.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			WorkOrder.belongsTo(models.Indent, {
				foreignKey: 'indent_id',
				as: 'indent',
			});
			WorkOrder.hasMany(models.WorkOrderItem, {
				foreignKey: 'work_order_id',
				as: 'items',
			});
			WorkOrder.hasMany(models.PaymentRequisition, {
				foreignKey: 'wo_id',
				as: 'paymentRequisitions',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'price_term_id',
				as: 'priceTerm',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'gst_term_id',
				as: 'gstTerm',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'payment_term_id',
				as: 'paymentTerm',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'delivery_term_id',
				as: 'deliveryTerm',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'pf_term_id',
				as: 'pfTerm',
			});
			WorkOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'ld_clause_term_id',
				as: 'ldClauseTerm',
			});
		}
	}
	WorkOrder.init(
		{
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: DataTypes.INTEGER,
			},
			org_id: {
				type: DataTypes.INTEGER,
				references: { model: 'organizations', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			indent_id: {
				type: DataTypes.INTEGER,
				references: { model: 'Indents', key: 'id' },
				allowNull: true,
				onDelete: 'CASCADE',
			},
			vendorId: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			bank_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			bankSnapshot: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			woPrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			woNo: {
				type: DataTypes.STRING,
				unique: true,
				allowNull: false,
			},
			woPostfix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			dueDate: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			total_taxable: {
				type: DataTypes.DECIMAL(15, 2),
			},
			total_tax: {
				type: DataTypes.DECIMAL(15, 2),
			},
			discount: {
				type: DataTypes.JSON,
			},
			otherTax: {
				type: DataTypes.JSON,
			},
			isRoundOff: {
				type: DataTypes.BOOLEAN,
			},
			grandTotal: {
				type: DataTypes.DECIMAL(15, 2),
			},
			paymentType: {
				type: DataTypes.JSON,
			},
			vendorInfo: {
				type: DataTypes.JSON,
			},
			woDetail: {
				type: DataTypes.JSON,
			},
			additionalNotes: {
				type: DataTypes.JSON,
			},
			customFields: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
			},
			same_state: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			status: {
				type: DataTypes.ENUM(['draft', 'in_progress', 'approved', 'rejected', 'cancelled', 'pending', 'completed']),
				defaultValue: 'draft',
			},
			approved_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			approved_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			rejected_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			rejected_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			rejection_remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			cancelled_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			cancelled_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			cancellation_remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			paymentStatus: {
				type: DataTypes.STRING,
				allowNull: true,
				defaultValue: 'PENDING',
			},
			totalPaid: {
				type: DataTypes.DECIMAL(15, 2),
				defaultValue: 0,
				allowNull: true,
			},
			remainingAmount: {
				type: DataTypes.DECIMAL(15, 2),
				defaultValue: 0,
				allowNull: true,
			},
			wo_qc_check: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			price_term_id: {
				type: DataTypes.INTEGER,
			},
			gst_term_id: {
				type: DataTypes.INTEGER,
			},
			payment_term_id: {
				type: DataTypes.INTEGER,
			},
			payment_term_value: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
				defaultValue: null,
			},
			payment_term_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: true,
				defaultValue: null,
			},
			delivery_term_id: {
				type: DataTypes.INTEGER,
			},
			delivery_term_days: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			pf_term_id: {
				type: DataTypes.INTEGER,
			},
			ld_clause_term_id: {
				type: DataTypes.INTEGER,
			},
			dispatch_id: {
				type: DataTypes.INTEGER,
			},
			start_date: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			end_date: {
				type: DataTypes.DATEONLY,
				allowNull: true,
			},
			retention: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
			},
			retention_amount: {
				type: DataTypes.DECIMAL(15, 2),
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
			modelName: 'WorkOrder',
		},
	);
	return WorkOrder;
};
