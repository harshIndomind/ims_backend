const amqp    = require('amqplib');
const logger  = require('../utils/logger');
const { rabbitmq, APP_CODE } = require('./serverConfig');

const RABBITMQ_URL = rabbitmq.url; // amqp://user:pass@host:5672

// Exchange and queue config
const EXCHANGE     = 'erp.events';
const DLX          = 'erp.events.dlx';        // dead letter exchange

const QUEUE_CONFIG = {
  AUTH: {
    queue: 'auth.sync.queue',
    dlq:   'auth.sync.dlq',
  },
  VCP: {
    queue: 'vcp.sync.queue',
    dlq:   'vcp.sync.dlq',
  },
  SCM: {
    queue: 'scm.sync.queue',
    dlq:   'scm.sync.dlq',
  },
  ACCOUNTING: {
    queue: 'accounting.sync.queue',
    dlq:   'accounting.sync.dlq',
  },
};

// Routing keys published across all services
const ROUTING_KEYS = [
  'org.created',
  'org.updated',
  'org.deactivated',
  'org.bank.added',
  'org.bank.updated',
  'org.bank.deleted',
  'user.created',
  'user.updated',
  'user.deactivated',
  'user.activated',
  'user.password_changed',
  'user.roles_updated',
  'user.profile_updated',
  'master.synced',
  'master_unit.created',
  'master_unit.updated',
  'master_unit.deleted',
  'department.created',
  'department.updated',
  'department.deleted',
  'designation.created',
  'designation.updated',
  'designation.deleted',
];

let connection = null;
let channel    = null;

async function connect() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);

    // Handle connection errors
    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error', { error: err.message });
      reconnect();
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed — reconnecting');
      reconnect();
    });

    channel = await connection.createChannel();

    // Prefetch — process one message at a time per consumer
    // Prevents overwhelming the service
    await channel.prefetch(1);

    // ── Setup exchanges ────────────────────────────────────
    // Main exchange
    await channel.assertExchange(EXCHANGE, 'topic', {
      durable:    true,   // survives RabbitMQ restart
      autoDelete: false,
    });

    // Dead letter exchange
    await channel.assertExchange(DLX, 'topic', {
      durable:    true,
      autoDelete: false,
    });

    // ── Setup queues for each service ──────────────────────
    for (const [serviceCode, config] of Object.entries(QUEUE_CONFIG)) {

      // Dead letter queue — receives failed messages
      await channel.assertQueue(config.dlq, {
        durable: true,
      });
      await channel.bindQueue(config.dlq, DLX, `${serviceCode.toLowerCase()}.#`);

      // Main queue with DLX config
      await channel.assertQueue(config.queue, {
        durable:   true,
        arguments: {
          'x-dead-letter-exchange':    DLX,
          'x-dead-letter-routing-key': `${serviceCode.toLowerCase()}.failed`,
          'x-message-ttl':             86400000,  // 24 hours — then goes to DLQ
        },
      });

      // Bind queue to all routing keys
      for (const key of ROUTING_KEYS) {
        await channel.bindQueue(config.queue, EXCHANGE, key);
      }
    }

    logger.info('✅ RabbitMQ connected and configured');
    return channel;

  } catch (err) {
    logger.error('RabbitMQ setup failed', { error: err.message });
    setTimeout(connect, 5000);  // retry after 5 seconds
  }
}

// Reconnect with exponential backoff
let reconnectAttempts = 0;
async function reconnect() {
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000); // max 30 seconds
  reconnectAttempts++;
  logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(connect, delay);
}

function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
}

module.exports = { connect, getChannel, EXCHANGE, QUEUE_CONFIG, ROUTING_KEYS };