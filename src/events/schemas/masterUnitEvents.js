'use strict';

const crypto = require('crypto');
const { APP_CODE } = require('../../config/serverConfig');

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

function pickSyncFields(masterUnit) {
	const data = {};
	for (const key of SYNC_FIELDS) data[key] = masterUnit[key];
	return data;
}

function buildMasterUnitCreatedEvent(masterUnit, orgUuid) {
	return {
		eventId: crypto.randomUUID(),
		eventType: 'master_unit.created',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid: masterUnit.uuid,
			org_uuid: orgUuid,
			...pickSyncFields(masterUnit),
		},
	};
}

function buildMasterUnitUpdatedEvent(masterUnit, orgUuid) {
	return {
		eventId: crypto.randomUUID(),
		eventType: 'master_unit.updated',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: {
			uuid: masterUnit.uuid,
			org_uuid: orgUuid,
			...pickSyncFields(masterUnit),
		},
	};
}

function buildMasterUnitDeletedEvent(masterUnit) {
	return {
		eventId: crypto.randomUUID(),
		eventType: 'master_unit.deleted',
		version: '1.0',
		timestamp: new Date().toISOString(),
		source: APP_CODE,
		data: { uuid: masterUnit.uuid },
	};
}

module.exports = {
	buildMasterUnitCreatedEvent,
	buildMasterUnitUpdatedEvent,
	buildMasterUnitDeletedEvent,
};
