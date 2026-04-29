const fetchPermissions = require('../helpers/fetchPermissions');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const checkPermission = (menu, action) => {  
  const menus = Array.isArray(menu) ? menu : [menu];
  const ACTION = action.toLowerCase();

  return async (req, res, next) => {

    // Super Admin bypass — check roles array not isSuperAdmin
    if (req.user?.roles?.includes('super_admin')) {
      return next();
    }

    try {
      const userPermissions = await fetchPermissions(req);

      // Pass if the user holds the required permission for ANY of the given menus
      const hasPermission = menus.some(m =>
        userPermissions.includes(`${m}:${ACTION}`) ||
        (ACTION === 'view' && userPermissions.includes(`${m}:api_read`))
      );

      if (!hasPermission) {
        return next(new AppError('You do not have permission to perform this action', 403));
      }

      next();

    } catch (err) {
      next(err);
    }
  };
};

module.exports = checkPermission;