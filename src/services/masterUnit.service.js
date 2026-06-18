const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterUnitsRepositoy } = require('../repository/index');
const { Country, GstStateCode, organization } = require('../models/index');
const logger = require('../utils/logger');

const COMPANY_DETAIL_FIELDS = [
	'unit_name',
	'unit_short_name',
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

const DETAIL_INCLUDES = [
	{ model: Country, as: 'countryData', attributes: ['id', 'name'] },
	{ model: GstStateCode, as: 'stateData', attributes: ['id', 'state_name', 'gst_code_padded'] },
	{ model: organization, as: 'organization', attributes: ['id', 'org_name'] },
];

function pickCompanyFields(payload) {
	const data = {};
	for (const key of COMPANY_DETAIL_FIELDS) {
		if (key in payload) data[key] = payload[key];
	}
	return data;
}

function assertOrgAccess(req, masterUnit) {
	if (req.user.isSuperAdmin) return;
	if (masterUnit.org_id !== req.user.org_id) {
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}
}

exports.createMasterUnit = async (req, payload) => {
	const { org_id } = req.user;
	const { unit_name, unit_short_name } = payload;

	if (!unit_name) {
		logger.warn('Validation failed while creating Master Unit', payload);
		throw new AppError('Unit name is required', StatusCodes.BAD_REQUEST);
	}

	const masterUnit = await masterUnitsRepositoy.create({
		org_id,
		unitName: unit_name,
		...pickCompanyFields(payload),
	});

	logger.info('Master Unit created', { id: masterUnit.id, unit_name });

	return masterUnit;
};

exports.updateMasterUnit = async (req, id, payload) => {
	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found for update', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}
	assertOrgAccess(req, masterUnit);

	// unitCd, unitName, lock, masterUnitid are HRMS-synced — never overwrite via API
	await masterUnitsRepositoy.update(masterUnit, pickCompanyFields(payload));

	logger.info('Master Unit updated', { id });

	return masterUnit.reload({ include: DETAIL_INCLUDES });
};

exports.getAllMasterUnit = async (req) => {
	logger.info('Fetching all Master Units');
	const { org_id, isSuperAdmin } = req.user;
	const { limit, offset, active, org_id: filterOrgId } = req.query;

	const where = {
		// Super Admins may browse units across organizations via the org dropdown;
		// everyone else stays locked to their own organization.
		...(isSuperAdmin
			? filterOrgId && { org_id: Number(filterOrgId) }
			: { org_id: Number(org_id) }),
		...(active === 'true' && { lock: false }),
	};

	const filterOptions = { include: DETAIL_INCLUDES };

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	return await masterUnitsRepositoy.findAll(where, filterOptions);
};

exports.getMasterUnitById = async (req, id) => {
	const masterUnit = await masterUnitsRepositoy.findById(id, { include: DETAIL_INCLUDES });

	if (!masterUnit) {
		logger.warn('Master Unit not found', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}
	assertOrgAccess(req, masterUnit);

	logger.info('Master Unit fetched', { id });

	return masterUnit;
};

exports.toggleMasterUnitStatus = async (req, id) => {
	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found for status toggle', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}
	assertOrgAccess(req, masterUnit);

	await masterUnitsRepositoy.update(masterUnit, { lock: !masterUnit.lock });

	logger.info('Master Unit status toggled', { id, lock: masterUnit.lock });

	return masterUnit;
};

exports.deleteMasterUnit = async (req, id) => {
	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found for delete', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}
	assertOrgAccess(req, masterUnit);

	await masterUnitsRepositoy.delete(masterUnit);

	logger.info('Master Unit deleted', { id });

	return true;
};
