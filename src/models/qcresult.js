'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class QcResult extends Model {
		static associate(models) {
			QcResult.belongsTo(models.QcInspectionItem, {
				foreignKey: 'qc_inspection_item_id',
				as: 'inspectionItem',
			});
			QcResult.belongsTo(models.QcTemplateItem, {
				foreignKey: 'qc_template_item_id',
				as: 'templateItem',
			});
		}
	}
	QcResult.init(
		{
			qc_inspection_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			qc_template_item_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			observed_value: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			result: {
				type: DataTypes.ENUM('pass', 'fail', 'na'),
				allowNull: false,
				defaultValue: 'na',
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'QcResult',
			tableName: 'qc_results',
		},
	);
	return QcResult;
};
