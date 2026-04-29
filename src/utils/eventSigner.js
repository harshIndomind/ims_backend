const crypto = require('crypto');
const { EVENT_SECRET } = require('../config/serverConfig');

function signEvent(payload) {
  const data      = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', EVENT_SECRET)
    .update(data)
    .digest('hex');
  return signature;
}

function verifyEvent(payload, signature) {
  const expected = signEvent(payload);
  // Timing-safe comparison — prevents timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

module.exports = { signEvent, verifyEvent };