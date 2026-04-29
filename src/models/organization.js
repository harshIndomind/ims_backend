'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class organization extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			// organization.belongsTo(User, { foreignKey: 'user_id' }, { onDelete: 'CASCADE' });
			// Organization.belongsTo(Plan, { foreignKey: 'plan_id' }, { onDelete: 'SET NULL' });
			organization.hasMany(models.OrganizationBankDetails, {
				foreignKey: 'org_id',
				as: 'bankDetails',
			});
			organization.belongsTo(models.GstStateCode, {
				foreignKey: 'state_id',
				as: '_state',
			});
		}
	}
	organization.init(
		{
			uuid: {
				type: DataTypes.CHAR(36),
				defaultValue: DataTypes.UUIDV4,
				allowNull: false,
				unique: true,
			},
			swayamm_org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			org_name: { type: DataTypes.STRING, allowNull: false },
			org_code: { type: DataTypes.STRING, allowNull: false, unique: true },
			is_gst_registered: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			org_gst_number: { type: DataTypes.STRING, allowNull: true },
			update_gst_on_invoices: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
			pan: { type: DataTypes.STRING, allowNull: true },
			org_email: { type: DataTypes.STRING, allowNull: false },
			org_person_name: { type: DataTypes.STRING, allowNull: false },
			org_person_contact: { type: DataTypes.STRING, allowNull: false },
			org_address: { type: DataTypes.STRING, allowNull: true },
			pincode: { type: DataTypes.INTEGER, allowNull: true },
			state: { type: DataTypes.STRING, allowNull: true },
			state_id: {
				type: DataTypes.INTEGER,
				references: {
					model: 'GstStateCodes',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
				allowNull: true,
			},
			city: { type: DataTypes.STRING, allowNull: true },
			// plan_id: {
			// 	type: DataTypes.INTEGER,
			// 	allowNull: true,
			// 	references: { model: 'Plans', key: 'id' },
			// 	onUpdate: 'SET NULL',
			// 	onDelete: 'SET NULL',
			// },
			// plan_expiry_date: { type: DataTypes.DATE, allowNull: true },
			// features: { type: DataTypes.JSON, allowNull: true },
			status: {
				type: DataTypes.ENUM('active', 'inactive', 'suspended'),
				allowNull: false,
				defaultValue: 'active',
			},
			createdBy: { type: DataTypes.INTEGER, allowNull: false },
		},
		{
			sequelize,
			modelName: 'organization',
		},
	);
	return organization;
};
