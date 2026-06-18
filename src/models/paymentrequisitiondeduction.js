'use strict';
const { Model } = require('sequelize');

const DEDUCTION_TYPES = ['RETENTION', 'TDS', 'SECURITY_DEPOSIT', 'ADVANCE_RECOVERY', 'LD', 'GST_TDS', 'WCT', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
	class PaymentRequisitionDeduction extends Model {
		static associate(models) {
			PaymentRequisitionDeduction.belongsTo(models.PaymentRequisition, {
				foreignKey: 'payment_requisition_id',
				as: 'paymentRequisition',
			});
		}
	}

	PaymentRequisitionDeduction.init(
		{
			payment_requisition_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: { model: 'PaymentRequisitions', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			deduction_type: {
				type: DataTypes.ENUM(...DEDUCTION_TYPES),
				allowNull: false,
			},
			deduction_name: {
				type: DataTypes.STRING(150),
				allowNull: true,
			},
			percentage: {
				type: DataTypes.DECIMAL(5, 2),
				allowNull: true,
				defaultValue: null,
			},
			amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
				defaultValue: 0,
			},
			remarks: {
				type: DataTypes.TEXT,
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
			modelName: 'PaymentRequisitionDeduction',
		},
	);

	return PaymentRequisitionDeduction;
};

module.exports.DEDUCTION_TYPES = DEDUCTION_TYPES;
