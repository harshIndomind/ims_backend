'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class QcTemplate extends Model {
		static associate(models) {
			QcTemplate.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			QcTemplate.hasMany(models.QcTemplateItem, {
				foreignKey: 'qc_template_id',
				as: 'items',
			});
			QcTemplate.hasMany(models.QcInspection, {
				foreignKey: 'template_id',
				as: 'inspections',
			});
		}
	}
	QcTemplate.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'organizations', key: 'id' },
			},
			name: {
				type: DataTypes.STRING(255),
				allowNull: false,
			},
			document_type: {
				type: DataTypes.ENUM('purchase_order', 'work_order', 'both'),
				allowNull: false,
				defaultValue: 'both',
			},
			product_category_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
			is_default: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			version: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 1,
			},
		},
		{
			sequelize,
			modelName: 'QcTemplate',
			tableName: 'qc_templates',
		},
	);
	return QcTemplate;
};
