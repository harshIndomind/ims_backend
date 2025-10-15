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

			User.hasOne(models.BusinessPartner, {
				foreignKey: 'user_id',
				as: 'partner', // optional alias for reverse lookup
			});
		}
	}
	User.init(
		{
			org_id: {
				type: DataTypes.STRING,
				allowNull: true,
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
			// vendor_company_name: {
			// 	type: DataTypes.STRING,
			// 	allowNull: true,
			// },
			// vendor_company_code: {
			// 	type: DataTypes.STRING,
			// 	allowNull: true,
			// 	unique: true,
			// },
			// vendor_contact_no: {
			// 	type: DataTypes.STRING,
			// 	allowNull: true,
			// },
			// vendor_address: {
			// 	type: DataTypes.STRING,
			// 	allowNull: true,
			// },
			roleId: {
				type: DataTypes.INTEGER,
				references: {
					model: 'Roles',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			},
			is_active: {
				type: DataTypes.BOOLEAN,
				defaultValue: false
			},
			last_login: {
				type: DataTypes.DATE,
				allowNull: true,
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
