'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class BudgetRevision extends Model {
		static associate(models) {
			BudgetRevision.belongsTo(models.Budget, {
				foreignKey: 'budget_id',
				as: 'budget',
			});
		}
	}
	BudgetRevision.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			revision_no: {
				type: DataTypes.STRING(30),
				allowNull: true,
			},
			budget_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			previous_limit: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			revision_amount: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			revised_limit: {
				type: DataTypes.DECIMAL(15, 2),
				allowNull: false,
			},
			reason: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			source_document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: true,
			},
			source_document_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			status: {
				type: DataTypes.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'draft',
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
			modelName: 'BudgetRevision',
			tableName: 'budget_revisions',
		},
	);
	return BudgetRevision;
};
