'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
	class User extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {
			User.hasMany(models.DocumentsUpload, {
				foreignKey: 'user_id',
				as: 'vendor_docs',
			});
		}
	}
	User.init(
		{
			org_id: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			email: {
				type: DataTypes.STRING,
				unique: true,
				allowNull: false,
			},
			image: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			password: { type: DataTypes.STRING, allowNull: false },
			vendor_company_name: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			vendor_company_code: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: true,
			},
			vendor_contact_no: {
				type: DataTypes.STRING,
				allowNull: false,
			},
			vendor_address: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			roleId: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Roles',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			},
		},
		{
			sequelize,
			modelName: 'User',
		}
	);

	User.associate = (models) => {
		User.belongsTo(models.Role, { foreignKey: 'roleId' });

		User.belongsTo(models.organization, {
			foreignKey: 'org_id',
			as: 'organization',
		});
	};

	return User;
};
