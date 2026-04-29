'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class PurchaseOrderSerialItem extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of DataTypes lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			PurchaseOrderSerialItem.belongsTo(models.PurchaseOrderItem, {
				foreignKey: 'purchase_order_item_id',
				as: 'poItem',
			});
		}
	}
	PurchaseOrderSerialItem.init(
		{
			id: {
				allowNull: false,
				autoIncrement: true,
				primaryKey: true,
				type: DataTypes.INTEGER,
			},
			purchase_order_item_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'PurchaseOrderItems',
					key: 'id',
				},
				onDelete: 'CASCADE',
			},
			serial_no: {
				type: DataTypes.STRING,
				unique: true,
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
			modelName: 'PurchaseOrderSerialItem',
		}
	);
	return PurchaseOrderSerialItem;
};
