const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterUnitsRepositoy } = require('../repository/index');
const logger = require('../utils/logger');
const { organization } = require('../models/index');

exports.createMasterUnit = async (req, payload) => {
	const { org_id } = req.user;
	const { unit_name, unit_short_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while creating Master Unit', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const masterUnit = await masterUnitsRepositoy.create({
		org_id,
		unit_name,
		unit_short_name,
	});

	logger.info('Master Unit created', {
		id: masterUnit.id,
		unit_name: masterUnit.unit_name,
		unit_short_name: masterUnit.unit_short_name,
	});

	return masterUnit;
};

exports.updateMasterUnit = async (id, payload) => {
	const { unit_name, unit_short_name } = payload;

	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found for update', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}

	await masterUnitsRepositoy.update(masterUnit, {
		unit_name,
		unit_short_name,
	});

	logger.info('Master Unit updated', {
		id,
	});

	return masterUnit;
};

exports.getAllMasterUnit = async (req) => {
	logger.info('Fetching all Master Units');
	const { org_id } = req.user;
	const { limit, offset } = req.query;

	const where = {
		org_id: org_id ?? null
	};

	const filterOptions = {};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	filterOptions.include = [
		{
			model: organization,
			as: 'organization',
			attributes: ['org_code', 'org_name'],
		},
	];
	return await masterUnitsRepositoy.findAll({}, filterOptions);
};

exports.getMasterUnitById = async (id) => {
	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Unit fetched', { id });

	return masterUnit;
};

exports.deleteMasterUnit = async (id) => {
	const masterUnit = await masterUnitsRepositoy.findById(id);

	if (!masterUnit) {
		logger.warn('Master Unit not found for delete', { id });
		throw new AppError('Master Unit not found', StatusCodes.NOT_FOUND);
	}

	await masterUnitsRepositoy.delete(masterUnit);

	logger.info('Master Unit deleted', { id });

	return true;
};
