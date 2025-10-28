'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class OrganizationBankDetails extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			OrganizationBankDetails.belongsTo(models.organization, {
				foreignKey: 'org_id',
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE',
			});
		}
	}
	OrganizationBankDetails.init(
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
			account_name: {
				type: DataTypes.STRING,
			},
			bank_name: {
				type: DataTypes.STRING,
			},
			bank_ifsc: {
				type: DataTypes.STRING,
			},
			swift_code: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			micr_code: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			account_no: {
				type: DataTypes.STRING,
			},
			branch_name: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			upi_id: {
				type: DataTypes.STRING,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'OrganizationBankDetails',
		}
	);
	return OrganizationBankDetails;
};
