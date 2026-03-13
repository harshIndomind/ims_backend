const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterAccountRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { organization } = require('../models/index');

exports.createMasterAccount = async (req, payload) => {
	const { org_id } = req.user;
	const { code, name, station_code, account_id, is_lock } = payload;

	const masterAccount = await masterAccountRepository.create({
		org_id,
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center created', {
		id: masterAccount.id,
		org_id: masterAccount.org_id,
		code: masterAccount.code,
		name: masterAccount.name,
		station_code: masterAccount.station_code,
		account_id: masterAccount.account_id,
		is_lock: masterAccount.is_lock,
	});

	return masterAccount;
};

exports.updateMasterAccount = async (id, payload) => {
	const { code, name, station_code, account_id, is_lock } = payload;

	const masterAccount = await masterAccountRepository.findById(id);

	if (!masterAccount) {
		logger.warn('Cost center not found for update', { id });
		throw new AppError('Master Major Head not found', StatusCodes.NOT_FOUND);
	}

	await masterAccountRepository.update(masterAccount, {
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center updated', {
		id,
	});

	return masterAccount;
};

exports.getAllMasterAccount = async (options = {}) => {
	logger.info('Fetching all cost center');
	// options.include = [
	// 	{
	// 		model: organization,
	// 		as: 'organization',
	// 		attributes: ['org_code', 'org_name'],
	// 	},
	// ];
	return await masterAccountRepository.findAll({}, options);
};

exports.getMasterAccountById = async (id) => {
	const masterAccount = await masterAccountRepository.findById(id);

	if (!masterAccount) {
		logger.warn('Cost center not found', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Cost center fetched', { id });

	return masterAccount;
};

exports.deleteMasterAccount = async (id) => {
	const masterAccount = await masterAccountRepository.findById(id);

	if (!masterAccount) {
		logger.warn('Cost center not found for delete', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	await masterAccountRepository.delete(masterAccount);

	logger.info('Cost center deleted', { id });

	return true;
};
