'use strict';

const { MasterUnit, organization } = require('../../models');
const logger = require('../../utils/logger');

const SYNC_FIELDS = [
	'unitName',
	'lock',
	'gstin',
	'pan',
	'registration_type',
	'contact_no',
	'company_email',
	'is_tds_applicable',
	'tds_percentage',
	'address1',
	'address2',
	'landmark',
	'country_id',
	'state_id',
	'country',
	'state',
	'city',
	'pincode',
	'bank_account_holder_name',
	'bank_name',
	'bank_ifsc_code',
	'bank_account_no',
	'bank_branch_name',
	'fax',
	'website',
	'credit_limit',
	'due_days',
	'note',
	'ob_vendor_balance_type',
	'ob_vendor_amount',
	'ob_customer_balance_type',
	'ob_customer_amount',
];

async function resolveOrgId(orgUuid) {
	if (!orgUuid) return null;
	const org = await organization.findOne({ where: { uuid: orgUuid }, attributes: ['id'] });
	return org ? org.id : null;
}

async function applyMasterUnit(data) {
	const org_id = await resolveOrgId(data.org_uuid);

	const fields = {};
	for (const key of SYNC_FIELDS) fields[key] = data[key];

	await MasterUnit.upsert({
		uuid: data.uuid,
		org_id,
		...fields,
	});
}

async function handleMasterUnitCreated(data) {
	await applyMasterUnit(data);
	logger.info('[masterUnitHandler] Master Unit synced (created)', { uuid: data.uuid });
}

async function handleMasterUnitUpdated(data) {
	await applyMasterUnit(data);
	logger.info('[masterUnitHandler] Master Unit synced (updated)', { uuid: data.uuid });
}

async function handleMasterUnitDeleted(data) {
	await MasterUnit.destroy({ where: { uuid: data.uuid } });
	logger.info('[masterUnitHandler] Master Unit synced (deleted)', { uuid: data.uuid });
}

module.exports = { handleMasterUnitCreated, handleMasterUnitUpdated, handleMasterUnitDeleted };
