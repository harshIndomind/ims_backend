const AppError = require('../utils/AppError');

const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRoles = req.user?.roles ?? (req.user?.role ? [req.user.role] : []);
    const hasRole = userRoles.some((r) => allowedRoles.includes(r));
    if (!req.user || !hasRole) {
      return next(new AppError('Access denied! You are not authorized to perform this action', 403));
    }
    next();
  };
};

module.exports = checkRole;
