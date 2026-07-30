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
let reconnectAttempts = 0;
let reconnecting      = false;

function nextBackoffDelay() {
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  reconnectAttempts++;
  return delay;
}

async function connect() {
  while (true) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);

      // Handle connection errors
      connection.on('error', (err) => {
        logger.error('RabbitMQ connection error', { error: err.message });
      });

      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed — reconnecting');
        connection = null;
        channel = null;
        reconnect();
      });

      channel = await connection.createChannel();

      // Channel can fail independently of the connection (e.g. a
      // protocol violation) — without these, getChannel() would keep
      // handing out a dead channel forever.
      channel.on('error', (err) => {
        logger.error('RabbitMQ channel error', { error: err.message });
      });

      channel.on('close', () => {
        logger.warn('RabbitMQ channel closed — reconnecting');
        channel = null;
        reconnect();
      });

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

      logger.info('📨 RabbitMQ connected and configured');
      reconnectAttempts = 0;

      return channel;

    } catch (err) {
      logger.error('RabbitMQ setup failed', { error: err.message });
      const delay = nextBackoffDelay();
      logger.info(`Retrying RabbitMQ connection in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Reconnect with exponential backoff. Guarded so a connection 'close' and a
// channel 'close' firing together (common when the socket dies) only trigger
// one reconnect cycle.
async function reconnect() {
  if (reconnecting) return;
  reconnecting = true;

  if (connection) {
    connection.close().catch(() => {});
    connection = null;
  }

  try {
    await connect();
  } finally {
    reconnecting = false;
  }
}

function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
}

module.exports = { connect, getChannel, EXCHANGE, QUEUE_CONFIG, ROUTING_KEYS };