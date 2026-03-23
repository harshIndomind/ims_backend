const AppError = require('../utils/AppError');
const { User, Role, Permission } = require('../models');

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.id, {
        include: {
          model: Role,
          include: {
            model: Permission,
            as: 'permissions', // this alias must match Role association
            through: { attributes: [] },
          },
        },
      });

      if (!user || !user.Role) {
        return next(new AppError('User role not found', 403));
      }

      const permissions = user.Role.permissions || [];

      const hasPermission = permissions
        .map((perm) => perm.permission)
        .includes(requiredPermission);

      if (!hasPermission) {
        return next(new AppError('Access denied! Permission not granted.', 403));
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return next(new AppError('Server error during permission check', 500));
    }
  };
};

module.exports = checkPermission;
