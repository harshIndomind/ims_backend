'use strict';

const { Designation, organization } = require('../../models');
const logger = require('../../utils/logger');

const SYNC_FIELDS = ['title', 'desCd', 'desName', 'is_active'];

function pickSyncFields(data) {
	const fields = {};
	for (const key of SYNC_FIELDS) fields[key] = data[key];
	return fields;
}

async function resolveOrgId(orgUuid) {
	if (!orgUuid) return null;
	const org = await organization.findOne({ where: { uuid: orgUuid }, attributes: ['id'] });
	return org ? org.id : null;
}

async function applyDesignation(data) {
	const org_id = await resolveOrgId(data.org_uuid);

	await Designation.upsert({
		uuid: data.uuid,
		org_id,
		department_id: null,
		...pickSyncFields(data),
	});
}

async function handleDesignationCreated(data) {
	await applyDesignation(data);
	logger.info('[designationHandler] Designation synced (created)', { uuid: data.uuid });
}

async function handleDesignationUpdated(data) {
	await applyDesignation(data);
	logger.info('[designationHandler] Designation synced (updated)', { uuid: data.uuid });
}

async function handleDesignationDeleted(data) {
	await Designation.destroy({ where: { uuid: data.uuid } });
	logger.info('[designationHandler] Designation synced (deleted)', { uuid: data.uuid });
}

module.exports = { handleDesignationCreated, handleDesignationUpdated, handleDesignationDeleted };
