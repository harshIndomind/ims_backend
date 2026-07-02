'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class Indent extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			Indent.belongsTo(models.MasterPeriod, {
				foreignKey: 'period_id',
				as: 'period',
			});
			Indent.belongsTo(models.Department, {
				foreignKey: 'department_id',
				as: 'department',
			});
			Indent.belongsTo(models.IndentRemark, {
				foreignKey: 'remarks_id',
				as: 'remark',
			});
			Indent.hasMany(models.IndentItem, {
				foreignKey: 'indent_id',
				as: 'IndentItems',
			});
			Indent.belongsTo(models.MasterUnit, {
				foreignKey: 'unit_id',
				as: 'unit',
			});
			Indent.belongsTo(models.MasterPlaceOfUse, {
				foreignKey: 'place_of_use_id',
				as: 'placeOfUse',
			});
			Indent.hasMany(models.IndentDocument, {
				foreignKey: 'indent_id',
				as: 'IndentDocuments',
			});
		}
	}
	Indent.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'organizations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			period_id: {
				type: DataTypes.INTEGER,
			},
			budgetType: {
				type: DataTypes.ENUM('item-wise', 'value-wise'),
			},
			unit_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			place_of_use_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			indent_no: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			indent_date: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			department_id: {
				type: DataTypes.INTEGER,
			},
			annexure: {
				type: DataTypes.STRING(200),
				allowNull: true,
			},
			remarks_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			is_drawing_required: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			drawing_details: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			isVerified: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
			},
			verifiedBy: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			// Denormalized read-model columns mirroring workflow_instances, kept in sync by
			// workflowEngine.service.js calls in indent.service.js — the workflow tables remain
			// the source of truth. These exist only so list/export `WHERE` filters stay simple.
			status: {
				type: DataTypes.ENUM('draft', 'in_progress', 'approved', 'rejected', 'cancelled'),
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
			// Approver-supplied deadline by which the approved items must be issued;
			// distinct from approved_at, which is just the system timestamp of the action.
			last_date: {
				type: DataTypes.DATEONLY,
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
			createdBy: {
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
			modelName: 'Indent',
		},
	);
	return Indent;
};
