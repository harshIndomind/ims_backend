const { getChannel, EXCHANGE } = require('../config/rabbitmq');
const { APP_CODE } = require('../config/serverConfig');
const { signEvent }            = require('../utils/eventSigner');
const logger                   = require('../utils/logger');

async function publishEvent(routingKey, payload) {
  try {
    const channel   = getChannel();
    const signature = signEvent(payload);

    const message = {
      ...payload,
      signature,
    };

    const published = channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent:  true,
        contentType: 'application/json',
        headers: {
          'x-source':    APP_CODE,
          'x-event-id':  payload.eventId,
          'x-timestamp': payload.timestamp,
        },
      }
    );

    if (!published) {
      await waitForDrain(channel);
    }

    logger.info('Event published', {
      eventId:   payload.eventId,
      eventType: payload.eventType,
      routingKey,
    });
  } catch (err) {
    logger.error('Failed to publish event', {
      error:      err.message,
      routingKey,
      eventType:  payload.eventType,
    });
    // Don't throw — profile update already succeeded in DB
  }
}

function waitForDrain(channel) {
  return new Promise(resolve => channel.once('drain', resolve));
}

module.exports = { publishEvent };
