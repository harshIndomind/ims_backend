const { SHOULD_SYNC_HRMS } = require('../config/serverConfig');
const AppError = require('../utils/AppError');

const checkSyncHrms = (req, res, next) => {
  if (!SHOULD_SYNC_HRMS) {
    return next(new AppError('User creation is disabled — HRMS sync is not enabled for this instance', 403));
  }
  next();
};

module.exports = checkSyncHrms;
