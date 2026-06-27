// In-process event bus for intra-service decoupling. Workflow transitions
// (`src/services/workflowEngine.service.js`) emit `workflow.<documentType>.<action>` here —
// kept separate from the RabbitMQ bus (`src/events/`), which is for cross-service
// propagation and would otherwise discard same-service events via its own echo prevention.
const EventEmitter = require('node:events');
const eventEmitter = new EventEmitter();

eventEmitter.on('issueCreated', () => {
    console.log('A Issue is created. ✅');
})

module.exports = eventEmitter;