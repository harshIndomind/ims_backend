const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { costCenterRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { organization, MasterAccount } = require('../models/index');

exports.createCostCenter = async (req, payload) => {
	const { org_id } = req.user;
	const { code, name, station_code, account_id, is_lock } = payload;

	const costCenter = await costCenterRepository.create({
		org_id,
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center created', {
		id: costCenter.id,
		org_id: costCenter.org_id,
		code: costCenter.code,
		name: costCenter.name,
		station_code: costCenter.station_code,
		account_id: costCenter.account_id,
		is_lock: costCenter.is_lock,
	});

	return costCenter;
};

exports.updateCostCenter = async (id, payload) => {
	const { code, name, station_code, account_id, is_lock } = payload;

	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found for update', { id });
		throw new AppError('Master Major Head not found', StatusCodes.NOT_FOUND);
	}

	await costCenterRepository.update(costCenter, {
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center updated', {
		id,
	});

	return costCenter;
};

exports.getAllCostCenter = async (options = {}) => {
	logger.info('Fetching all cost center');
	options.include = [
		{
			model: organization,
			as: 'organization',
			attributes: ['org_code', 'org_name'],
		},
		{
			model: MasterAccount,
			as: 'account',
			attributes: ['id', 'A_NAME', 'A_CODE'],
		},
	];
	return await costCenterRepository.findAll({}, options);
};

exports.getCostCenterById = async (id) => {
	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Cost center fetched', { id });

	return costCenter;
};

exports.deleteCostCenter = async (id) => {
	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found for delete', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	await costCenterRepository.delete(costCenter);

	logger.info('Cost center deleted', { id });

	return true;
};
