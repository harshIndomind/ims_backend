'use strict';

const { Department, MasterUnit, organization } = require('../../models');
const logger = require('../../utils/logger');

const SYNC_FIELDS = ['name', 'depCd', 'depName', 'description', 'unitCd', 'is_active'];

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

async function resolveUnitId(unitCd) {
	if (!unitCd) return null;
	const unit = await MasterUnit.findOne({ where: { unitCd }, attributes: ['id'] });
	return unit ? unit.id : null;
}

async function applyDepartment(data) {
	const org_id = await resolveOrgId(data.org_uuid);
	const unit_id = await resolveUnitId(data.unitCd);

	await Department.upsert({
		uuid: data.uuid,
		org_id,
		unit_id,
		...pickSyncFields(data),
	});
}

async function handleDepartmentCreated(data) {
	await applyDepartment(data);
	logger.info('[departmentHandler] Department synced (created)', { uuid: data.uuid });
}

async function handleDepartmentUpdated(data) {
	await applyDepartment(data);
	logger.info('[departmentHandler] Department synced (updated)', { uuid: data.uuid });
}

async function handleDepartmentDeleted(data) {
	await Department.destroy({ where: { uuid: data.uuid } });
	logger.info('[departmentHandler] Department synced (deleted)', { uuid: data.uuid });
}

module.exports = { handleDepartmentCreated, handleDepartmentUpdated, handleDepartmentDeleted };
