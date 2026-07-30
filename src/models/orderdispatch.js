'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OrderDispatch extends Model {
		static associate(models) {
			OrderDispatch.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			OrderDispatch.belongsTo(models.MasterDispatchMethod, {
				foreignKey: 'dispatch_method_id',
				as: 'dispatchMethod',
			});
			OrderDispatch.hasMany(models.OrderAcknowledgement, {
				foreignKey: 'dispatch_id',
				as: 'acknowledgements',
			});
		}
	}
	OrderDispatch.init(
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
			dispatch_no: {
				type: DataTypes.INTEGER,
				allowNull: false,
			},
			dispatch_method_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: { model: 'MasterDispatchMethods', key: 'id' },
			},
			dispatch_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			recipient_name: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			recipient_email: {
				type: DataTypes.STRING(255),
				allowNull: true,
			},
			reference_no: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			email_status: {
				type: DataTypes.ENUM('not_applicable', 'queued', 'sent', 'failed'),
				allowNull: false,
				defaultValue: 'not_applicable',
			},
			dispatched_by: {
				type: DataTypes.JSON,
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'OrderDispatch',
			tableName: 'order_dispatches',
		},
	);
	return OrderDispatch;
};
