// auth-service/src/events/schemas/userEvents.js

const { APP_CODE } = require('../../config/serverConfig');

function buildUserCreatedEvent(user, roles) {
	return {
		eventId: require('crypto').randomUUID(), // unique per event
		eventType: 'user.created',
		version: '1.0', // schema version
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid: user.uuid,
			org_uuid: user.org_uuid,
			email: user.email,
			name: user.name,
			password: user.password, // already hashed
			org_id: user.org_id, // Auth org id
			is_active: user.is_active,
			employee_code: user.employee_code,
			department_id: user.department_id,
			designation_id: user.designation_id,
			layer: user.layer,
			image: user.image,
			logo: user.logo,
			roles, // { VCP: ['org_admin'], SCM: ['org_admin'] }
		},
	};
}

function buildUserUpdatedEvent(user) {
	return {
		eventId: require('crypto').randomUUID(),
		eventType: 'user.updated',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid: user.uuid,
			org_uuid: user.org_uuid,
			auth_user_id: user.id,
			email: user.email,
			name: user.name,
			org_id: user.org_id,
			is_active: user.is_active,
			employee_code: user.employee_code,
		},
	};
}

function buildUserProfileUpdatedEvent(uuid, updateData, roles) {
	const data = {
		uuid,
		name:  updateData.name,
		password: updateData.password,
		roles: roles ?? [],
	};
	if (updateData.image !== undefined) data.image = updateData.image;
	if (updateData.logo  !== undefined) data.logo  = updateData.logo;

	return {
		eventId:   require('crypto').randomUUID(),
		eventType: 'user.profile_updated',
		version:   '1.0',
		timestamp: new Date().toISOString(),
		source:    APP_CODE,
		data,
	};
}

function buildPasswordChangedEvent(uuid, hashedPassword) {
	return {
		eventId: require('crypto').randomUUID(),
		eventType: 'user.password_changed',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid,
			password: hashedPassword,
		},
	};
}

function buildUserRolesUpdatedEvent(uuid, roles) {
	return {
		eventId: require('crypto').randomUUID(),
		eventType: 'user.roles_updated',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid,
			roles, // { VCP: ['vendor'], SCM: ['indent_verifier'] }
		},
	};
}

module.exports = {
	buildUserCreatedEvent,
	buildUserUpdatedEvent,
	buildUserProfileUpdatedEvent,
	buildPasswordChangedEvent,
	buildUserRolesUpdatedEvent,
};
