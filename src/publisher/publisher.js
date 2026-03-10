const amqp = require('amqplib');

async function publishMessage() {
	try {
		// 1️⃣ Connect
		const connection = await amqp.connect('amqp://localhost');

		// 2️⃣ Create channel
		const channel = await connection.createChannel();

		const exchangeName = 'user_events';

		// 3️⃣ Assert exchange (fanout for broadcast)
		await channel.assertExchange(exchangeName, 'fanout', {
			durable: true,
		});

		let count = 1;

		// 4️⃣ Publish message

		setInterval(() => {
			const message = {
				userId: count,
				name: 'Harender',
				email: 'harender@test.com',
				event: 'USER_CREATED',
			};
			channel.publish(
				exchangeName,
				'',
				Buffer.from(JSON.stringify(message)),
				{ persistent: true }, // survive broker restart
			);

			console.log('✅ Event Published:', message);
			count++;
		}, 2000);

		// setTimeout(() => {
		//   connection.close();
		//   process.exit(0);
		// }, 500);
	} catch (error) {
		console.error('❌ Error:', error);
	}
}

module.exports = publishMessage;
