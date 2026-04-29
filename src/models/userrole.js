module.exports = (sequelize, DataTypes) => {
	const UserRole = sequelize.define(
		'UserRole',
		{
			user_id: DataTypes.INTEGER,
			role_id: DataTypes.INTEGER,
			assigned_by: {
				type: DataTypes.INTEGER,
				allowNull: true,
			},
			assigned_at: {
				allowNull: false,
				type: DataTypes.DATE,
			},
		},
		{
			tableName: 'user_roles',
			underscored: true,
			timestamps: false,
		},
	);

	return UserRole;
};
