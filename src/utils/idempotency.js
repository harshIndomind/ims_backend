// vcp-service/src/events/utils/idempotency.js

const { ProcessedEvent } = require('../models/index');

async function isAlreadyProcessed(eventId) {
  const existing = await ProcessedEvent.findOne({
    where: { event_id: eventId },
  });
  return !!existing;
}

async function markAsProcessed(eventId, eventType) {
  await ProcessedEvent.create({
    event_id:    eventId,
    event_type:  eventType,
    processed_at: new Date(),
  });
}

module.exports = { isAlreadyProcessed, markAsProcessed };