const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { JWT_ACCESS_SECRET } = require('../config/serverConfig');

const verifyToken = (req, res, next) => {
  const authHeader = req.cookies.accessToken;

  // Check if token is present
  // if (!authHeader || !authHeader.startsWith('Bearer ')) {
  if (!authHeader) {
    return next(new AppError('Authorization token missing', 401));
  }

  // const token = authHeader.split(' ')[1];
  const token = authHeader;

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
};

module.exports = verifyToken;
