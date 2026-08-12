'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class QcInspection extends Model {
		static associate(models) {
			QcInspection.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			QcInspection.belongsTo(models.OrderAcknowledgement, {
				foreignKey: 'acknowledgement_id',
				as: 'acknowledgement',
			});
			QcInspection.belongsTo(models.QcTemplate, {
				foreignKey: 'template_id',
				as: 'template',
			});
			QcInspection.belongsTo(models.User, {
				foreignKey: 'inspector_id',
				as: 'inspector',
			});
			QcInspection.belongsTo(models.QcInspection, {
				foreignKey: 'reinspection_of_id',
				as: 'reinspectionOf',
			});
			QcInspection.hasMany(models.QcInspection, {
				foreignKey: 'reinspection_of_id',
				as: 'reinspections',
			});
			QcInspection.hasMany(models.QcInspectionItem, {
				foreignKey: 'qc_inspection_id',
				as: 'items',
			});
		}
	}
	QcInspection.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: { model: 'organizations', key: 'id' },
			},
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order'),
				allowNull: false,
			},
			document_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			acknowledgement_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'order_acknowledgements', key: 'id' },
			},
			template_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'qc_templates', key: 'id' },
			},
			qc_no: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			inspection_type: {
				type: DataTypes.ENUM('incoming'),
				allowNull: false,
				defaultValue: 'incoming',
			},
			status: {
				type: DataTypes.ENUM('pending', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'cancelled'),
				allowNull: false,
				defaultValue: 'pending',
			},
			overall_result: {
				type: DataTypes.ENUM('pending', 'passed', 'partial', 'failed'),
				allowNull: false,
				defaultValue: 'pending',
			},
			inspector_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'Users', key: 'id' },
			},
			assigned_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			assigned_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			started_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			completed_at: {
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
			reinspection_of_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'qc_inspections', key: 'id' },
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'QcInspection',
			tableName: 'qc_inspections',
		},
	);
	return QcInspection;
};
