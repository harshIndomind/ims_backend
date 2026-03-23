module.exports = (sequelize, DataTypes) => {
  const UserRole = sequelize.define(
    'UserRole',
    {
      user_id: DataTypes.INTEGER,
      role_id: DataTypes.INTEGER,
    },
    {
      tableName: 'user_roles',
      underscored: true,
      timestamps: false,
    }
  );

  return UserRole;
};