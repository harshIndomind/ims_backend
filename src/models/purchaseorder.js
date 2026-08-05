'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseOrder extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			PurchaseOrder.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			PurchaseOrder.belongsTo(models.Indent, {
				foreignKey: 'indent_id',
				as: 'indent',
			});
			PurchaseOrder.hasMany(models.PurchaseOrderItem, {
				foreignKey: 'purchase_order_id',
				as: 'items',
			});
			PurchaseOrder.hasMany(models.PaymentRequisition, {
				foreignKey: 'po_id',
				as: 'paymentRequisitions',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'price_term_id',
				as: 'priceTerm',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'gst_term_id',
				as: 'gstTerm',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'payment_term_id',
				as: 'paymentTerm',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'delivery_term_id',
				as: 'deliveryTerm',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'pf_term_id',
				as: 'pfTerm',
			});
			PurchaseOrder.belongsTo(models.MasterTermsCondition, {
				foreignKey: 'ld_clause_term_id',
				as: 'ldClauseTerm',
			});
		}
	}
	PurchaseOrder.init(
		{
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: DataTypes.INTEGER,
			},
			org_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			indent_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Indents',
					key: 'id',
				},
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
			poPrefix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			poNo: {
				type: DataTypes.STRING,
				unique: true,
				allowNull: true,
			},
			poPostfix: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			doc_number: {
				type: DataTypes.STRING(100),
				unique: true,
				allowNull: true,
			},
			doc_sequence_no: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			doc_fiscal_year: {
				type: DataTypes.STRING(7),
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
			poDetail: {
				type: DataTypes.JSON,
			},
			additionalNotes: {
				type: DataTypes.JSON,
			},
			customFields: { type: DataTypes.JSON, allowNull: true },
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
			po_qc_check: {
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
			pf_term_id: {
				type: DataTypes.INTEGER,
			},
			ld_clause_term_id: {
				type: DataTypes.INTEGER,
			},
			dispatch_id: {
				type: DataTypes.INTEGER,
			},
			dispatch_status: {
				type: DataTypes.ENUM('not_dispatched', 'dispatched', 'acknowledged'),
				allowNull: false,
				defaultValue: 'not_dispatched',
			},
			last_dispatched_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			last_acknowledged_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			orderType: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
				defaultValue: 'purchase_order',
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
			modelName: 'PurchaseOrder',
		},
	);
	return PurchaseOrder;
};
