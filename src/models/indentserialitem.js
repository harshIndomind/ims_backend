'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class IndentSerialItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			IndentSerialItem.belongsTo(models.IndentItem, {
				foreignKey: 'indent_item_id',
				as: 'indent_item',
			});
		}
	}
	IndentSerialItem.init(
		{
			indent_item_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'IndentItems',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			product_id: {
				type: DataTypes.INTEGER,
			},
			serial_no: {
				type: DataTypes.STRING,
			},
			is_issued: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
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
			modelName: 'IndentSerialItem',
		},
	);
	return IndentSerialItem;
};
