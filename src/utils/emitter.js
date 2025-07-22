const EventEmitter = require('node:events');
const eventEmitter = new EventEmitter();

eventEmitter.on('issueCreated', () => {
    console.log('A Issue is created. ✅');
})

module.exports = eventEmitter;