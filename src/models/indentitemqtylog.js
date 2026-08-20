'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IndentItemQtyLog extends Model {
		static associate(models) {
			IndentItemQtyLog.belongsTo(models.Indent, {
				foreignKey: 'indent_id',
				as: 'indent',
			});
			IndentItemQtyLog.belongsTo(models.IndentItem, {
				foreignKey: 'indent_item_id',
				as: 'indentItem',
			});
		}
	}
	IndentItemQtyLog.init(
		{
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			indent_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			indent_item_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			product_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			field: {
				type: DataTypes.STRING(40),
				allowNull: false,
			},
			source: {
				type: DataTypes.STRING(40),
				allowNull: false,
			},
			source_ref_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			delta: {
				type: DataTypes.DOUBLE,
				allowNull: false,
			},
			previous_value: {
				type: DataTypes.DOUBLE,
				allowNull: false,
				defaultValue: 0,
			},
			new_value: {
				type: DataTypes.DOUBLE,
				allowNull: false,
				defaultValue: 0,
			},
			performed_by: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'IndentItemQtyLog',
			tableName: 'indent_item_qty_log',
		},
	);
	return IndentItemQtyLog;
};
