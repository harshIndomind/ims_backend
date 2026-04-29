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
			// 1. Documents
			// User.hasMany(models.DocumentsUpload, {
			// 	foreignKey: 'user_id',
			// 	as: 'vendor_docs',
			// });

			// // 2. BusinessPartner
			// User.hasOne(models.BusinessPartner, {
			// 	foreignKey: 'user_id',
			// 	as: 'partner',
			// });

			// 3. Role
			User.belongsTo(models.Role, { foreignKey: 'roleId' });

			// 4. Organization
			User.belongsTo(models.organization, {
				foreignKey: 'org_id',
				as: 'organization',
			});

			User.belongsToMany(models.Role, {
				through: models.UserRole,
				foreignKey: 'user_id',
				as: 'userRoles'
			});

			User.belongsTo(models.Department, { foreignKey: 'department_id' });
			User.belongsTo(models.Designation, { foreignKey: 'designation_id' });
		}
	}
	User.init(
		{
			uuid: {
				type: DataTypes.CHAR(36),
				defaultValue: DataTypes.UUIDV4,
				allowNull: false,
				unique: true,
			},
			org_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			employee_code: {
				type: DataTypes.STRING,
				allowNull: true,
			},
			department_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: {
					model: 'departments',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			designation_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: {
					model: 'designations',
					key: 'id',
				},
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			layer: {
				type: DataTypes.INTEGER,
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
				defaultValue: false,
			},
			last_login: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			logo: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			swayamm_user_id: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
		},
		{
			sequelize,
			modelName: 'User',
		},
	);

	// User.associate = (models) => {
	// 	User.belongsTo(models.Role, { foreignKey: 'roleId' });

	// 	User.belongsTo(models.organization, {
	// 		foreignKey: 'org_id',
	// 		as: 'organization',
	// 	});
	// };

	return User;
};
