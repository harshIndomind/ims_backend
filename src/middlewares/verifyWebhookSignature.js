const { WEBHOOK_SECRET_KEY } = require('../config/serverConfig');
const AppError = require('../utils/AppError');
const crypto = require('crypto'); 
// Middleware to verify webhook signature
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];

  if (!signature) {
    console.warn('Webhook attempt with missing signature');
    return next(new AppError('Access denied! Missing signature', 403));
  }

  const payload = JSON.stringify(req.body || {});
  console.log("payload ", payload);
  
  // Create HMAC SHA256 hash of the payload using your secret
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET_KEY)
    .update(payload)
    .digest('hex');

  if (signature !== hash) {
    console.warn('Unauthorized webhook attempt with invalid signature');
    return next(new AppError('Access denied! Invalid signature', 403));
  }

  // Signature is valid
  next();
}

module.exports = verifyWebhookSignature