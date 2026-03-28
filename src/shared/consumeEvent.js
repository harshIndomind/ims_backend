const UserService = require('../services/user.service');
const { getChannel } = require('./rabbitmq');
const bcrypt = require('bcrypt');

async function consumeAdminEvents() {
	const userService = new UserService();
	const channel = getChannel();

	const exchange = 'admin_exchange';
	const queue = 'admin_service_queue';

	await channel.assertExchange(exchange, 'topic', { durable: true });
	await channel.assertQueue(queue, { durable: true });
	await channel.bindQueue(queue, exchange, 'admin.*');
	channel.prefetch(1);
	console.log('👂 Waiting for admin events...');

	channel.consume(queue, async (msg) => {
		if (!msg) return;
		console.log('msg ', msg);
		const data = JSON.parse(msg.content.toString());
		const routingKey = msg.fields.routingKey;

		try {
			console.log('📥 Event Received:', routingKey, data);

			// 🔥 Route based on event type
			const hashedPassword = await bcrypt.hash(data.password, 10);
			const payload = {
				name: data.name,
				email: data.email,
				password: hashedPassword,
				roleId: data.roleId,
				employee_code: data.employee_code ?? null,
				department_id: data.department_id ?? null,
				designation_id: data.designation_id ?? null,
				layer: data.layer,
				org_id: data.org_id,
				swayamm_user_id: data.swayamm_user_id,
				is_active: data.is_active,
			};
			if (data.assignedApps?.includes('SCM')) {
				if (routingKey === 'admin.created') {
					await userService.create(payload);
				}

				// You can handle more events later
				if (routingKey === 'admin.updated') {
					await userService.update(payload.swayamm_user_id, payload);
				}
			}

			channel.ack(msg);
		} catch (error) {
			console.error('❌ Error processing message:', error);

			// ❗ Don't lose message
			channel.nack(msg, false, true); // send to DLQ later
		}
	});
}

async function consumeOrganizationEvents() {
	const userService = new UserService();
	const channel = getChannel();

	const exchange = 'admin_exchange';
	const queue = 'admin_service_queue';

	await channel.assertExchange(exchange, 'topic', { durable: true });
	await channel.assertQueue(queue, { durable: true });
	await channel.bindQueue(queue, exchange, 'organization.*');
	channel.prefetch(1);
	console.log('👂 Waiting for admin events...');

	channel.consume(queue, async (msg) => {
		if (!msg) return;
		console.log('msg ', msg);
		const data = JSON.parse(msg.content.toString());
		const routingKey = msg.fields.routingKey;

		try {
			console.log('📥 Event Received:', routingKey, data);

			// 🔥 Route based on event type
			const hashedPassword = await bcrypt.hash(data.password, 10);
			const payload = {
				name: data.name,
				email: data.email,
				password: hashedPassword,
				roleId: data.roleId,
				employee_code: data.employee_code ?? null,
				department_id: data.department_id ?? null,
				designation_id: data.designation_id ?? null,
				layer: data.layer,
				org_id: data.org_id,
				swayamm_user_id: data.swayamm_user_id,
				is_active: data.is_active,
			};
			if (data.assignedApps?.includes('SCM')) {
				if (routingKey === 'organization.created') {
					await userService.create(payload);
				}

				// You can handle more events later
				if (routingKey === 'organization.updated') {
					await userService.update(payload.swayamm_user_id, payload);
				}
			}

			channel.ack(msg);
		} catch (error) {
			console.error('❌ Error processing message:', error);

			// ❗ Don't lose message
			channel.nack(msg, false, true); // send to DLQ later
		}
	});
}

module.exports = {consumeAdminEvents, consumeOrganizationEvents};
