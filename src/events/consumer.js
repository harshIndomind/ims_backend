// vcp-service/src/events/consumer.js

const { getChannel, QUEUE_CONFIG } = require('../config/rabbitmq');
const { verifyEvent }              = require('../utils/eventSigner');
const { isAlreadyProcessed, markAsProcessed } = require('../utils/idempotency');
const { APP_CODE } = require('../config/serverConfig');
const userHandler = require('./handlers/userHandler');
const orgHandler  = require('./handlers/orgHandler');
const logger      = require('../utils/logger');

const QUEUE    = QUEUE_CONFIG[APP_CODE].queue;

async function startConsumer() {
  const channel = getChannel();

  logger.info(`Starting consumer on queue: ${QUEUE}`);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;

    let event;

    try {
      // ── Step 1: Parse message ───────────────────────────────
      event = JSON.parse(msg.content.toString());

      logger.info('Event received', {
        eventId:   event.eventId,
        eventType: event.eventType,
        source:    event.source,
      });

      // ── Step 2: Verify source ───────────────────────────────
      const TRUSTED_SOURCES = ['AUTH', 'VCP', 'SCM'];
      if (!TRUSTED_SOURCES.includes(event.source)) {
        logger.warn('Rejected event from unknown source', { source: event.source });
        channel.nack(msg, false, false); // discard — don't requeue
        return;
      }

      // Skip events we published ourselves (echo prevention)
      if (event.source === APP_CODE) {
        channel.ack(msg);
        return;
      }

      // ── Step 3: Verify HMAC signature ──────────────────────
      const { signature, ...payload } = event;
      if (!verifyEvent(payload, signature)) {
        logger.warn('Event signature verification failed', { eventId: event.eventId });
        channel.nack(msg, false, false); // discard — tampering detected
        return;
      }

      // ── Step 4: Check schema version ───────────────────────
      if (!event.version) {
        logger.warn('Event missing version', { eventId: event.eventId });
        channel.nack(msg, false, false);
        return;
      }

      // ── Step 5: Idempotency check ───────────────────────────
      const alreadyProcessed = await isAlreadyProcessed(event.eventId);
      if (alreadyProcessed) {
        logger.info('Duplicate event — skipping', { eventId: event.eventId });
        channel.ack(msg);  // ack so it leaves the queue
        return;
      }

      // ── Step 6: Route to handler ────────────────────────────
      await routeEvent(event);

      // ── Step 7: Mark as processed ───────────────────────────
      await markAsProcessed(event.eventId, event.eventType);

      // ── Step 8: Acknowledge ─────────────────────────────────
      channel.ack(msg);
      logger.info('Event processed successfully', { eventId: event.eventId });

    } catch (err) {
      logger.error('Event processing failed', {
        eventId:   event?.eventId,
        eventType: event?.eventType,
        error:     err.message,
        stack:     err.stack,
      });

      // ── Retry logic ─────────────────────────────────────────
      const retryCount = parseInt(msg.properties.headers?.['x-retry-count'] ?? 0, 10);
      const MAX_RETRIES = 3;
      if (retryCount < MAX_RETRIES) {
        // Republish with incremented x-retry-count so the counter actually advances.
        // nack+requeue would resend the original message with headers unchanged.
        channel.sendToQueue(
          QUEUE,
          msg.content,
          {
            ...msg.properties,
            headers: {
              ...msg.properties.headers,
              'x-retry-count': retryCount + 1,
            },
          }
        );
        channel.ack(msg); // remove original from queue

        logger.warn(`Retrying event (attempt ${retryCount + 1}/${MAX_RETRIES})`, {
          eventId: event?.eventId
        });
      } else {
        // Max retries exceeded → send to DLQ
        logger.error('Max retries exceeded — sending to DLQ', {
          eventId: event?.eventId
        });
        channel.nack(msg, false, false);  // don't requeue → goes to DLQ
      }
    }
  }, {
    noAck: false,  // manual acknowledgment — critical
  });
}

async function routeEvent(event) {
  const { eventType, data } = event;

  switch (eventType) {
    // User events
    case 'user.created':         return userHandler.handleUserCreated(data);
    case 'user.updated':         return userHandler.handleUserUpdated(data);
    case 'user.password_changed':return userHandler.handlePasswordChanged(data);
    case 'user.roles_updated':   return userHandler.handleUserRolesUpdated(data);
    case 'user.profile_updated': return userHandler.handleUserProfileUpdated(data);
    case 'user.deactivated':     return userHandler.handleUserDeactivated(data);
    case 'user.activated':       return userHandler.handleUserActivated(data);

    // Org events
    case 'org.created':          return orgHandler.handleOrgCreated(data);
    case 'org.updated':          return orgHandler.handleOrgUpdated(data);
    case 'org.deactivated':      return orgHandler.handleOrgDeactivated(data);
    case 'org.bank.added':       return orgHandler.handleBankAdded(data);
    case 'org.bank.updated':     return orgHandler.handleBankUpdated(data);
    case 'org.bank.deleted':     return orgHandler.handleBankDeleted(data);

    default:
      logger.warn('Unknown event type', { eventType });
      // Don't throw — just log and ack unknown events
  }
}

module.exports = { startConsumer };