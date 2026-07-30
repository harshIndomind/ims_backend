'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OrderAcknowledgement extends Model {
		static associate(models) {
			OrderAcknowledgement.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});
			OrderAcknowledgement.belongsTo(models.OrderDispatch, {
				foreignKey: 'dispatch_id',
				as: 'dispatch',
			});
			OrderAcknowledgement.belongsTo(models.MasterAcknowledgementMode, {
				foreignKey: 'acknowledgement_mode_id',
				as: 'mode',
			});
		}
	}
	OrderAcknowledgement.init(
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
			dispatch_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: { model: 'order_dispatches', key: 'id' },
			},
			acknowledged_by_name: {
				type: DataTypes.STRING(255),
				allowNull: false,
			},
			acknowledgement_date: {
				type: DataTypes.DATEONLY,
				allowNull: false,
			},
			acknowledgement_mode_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: { model: 'MasterAcknowledgementModes', key: 'id' },
			},
			vendor_reference_no: {
				type: DataTypes.STRING(100),
				allowNull: true,
			},
			remarks: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			recorded_by: {
				type: DataTypes.JSON,
				allowNull: false,
			},
		},
		{
			sequelize,
			modelName: 'OrderAcknowledgement',
			tableName: 'order_acknowledgements',
		},
	);
	return OrderAcknowledgement;
};
