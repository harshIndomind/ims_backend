'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class QcTemplateItem extends Model {
		static associate(models) {
			QcTemplateItem.belongsTo(models.QcTemplate, {
				foreignKey: 'qc_template_id',
				as: 'template',
			});
			QcTemplateItem.hasMany(models.QcResult, {
				foreignKey: 'qc_template_item_id',
				as: 'results',
			});
		}
	}
	QcTemplateItem.init(
		{
			qc_template_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			sequence: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: 0,
			},
			parameter_name: {
				type: DataTypes.STRING(255),
				allowNull: false,
			},
			parameter_type: {
				type: DataTypes.ENUM('boolean', 'numeric', 'text', 'pass_fail'),
				allowNull: false,
			},
			expected_value: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			tolerance_min: {
				type: DataTypes.DECIMAL(15, 4),
				allowNull: true,
			},
			tolerance_max: {
				type: DataTypes.DECIMAL(15, 4),
				allowNull: true,
			},
			unit: {
				type: DataTypes.STRING(50),
				allowNull: true,
			},
			is_required: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			},
		},
		{
			sequelize,
			modelName: 'QcTemplateItem',
			tableName: 'qc_template_items',
		},
	);
	return QcTemplateItem;
};
