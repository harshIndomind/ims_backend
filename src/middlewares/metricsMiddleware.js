const {
  httpRequestDuration,
  httpRequestsTotal,
} = require("../utils/metrics");

module.exports = function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);

    end(labels);
  });

  next();
};