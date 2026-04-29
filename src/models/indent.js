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
