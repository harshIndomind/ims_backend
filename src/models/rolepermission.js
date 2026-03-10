module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      role_id: DataTypes.INTEGER,
      permission_id: DataTypes.INTEGER,
    },
    {
      tableName: 'role_permissions',
      underscored: true,
      timestamps: false,
    }
  );

  return RolePermission;
};
