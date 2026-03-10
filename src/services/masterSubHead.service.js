const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadRepo } = require('../repository/index');
const logger = require('../utils/logger');
const {organization} = require('../models/index');

/**
 * Create
 */
exports.createMasterSubHead = async (req, payload) => {
	const { org_id } = req.user;
	const { sh_code, sh_name } = payload;

	if (!sh_code || !sh_name) {
		logger.warn('Validation failed while creating Master Major Head', payload);
		throw new AppError(
			'Sub head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const MasterSubHead = await masterSubHeadRepo.create({
		org_id,
		sh_code,
		sh_name,
	});

	logger.info('Sub Head created', {
		id: MasterSubHead.id,
		sh_code: MasterSubHead.sh_code,
	});

	return MasterSubHead;
};

/**
 * Update
 */
exports.updateMasterSubHead = async (id, payload) => {
	const { sh_code, sh_name } = payload;

	const MasterSubHead = await masterSubHeadRepo.findById(id);

	if (!MasterSubHead) {
		logger.warn('Sub Head not found for update', { id });
		throw new AppError('Sub Head not found', StatusCodes.NOT_FOUND);
	}

	await masterSubHeadRepo.update(MasterSubHead, {
		sh_code,
		sh_name,
	});

	logger.info('Sub Head updated', {
		id,
	});

	return MasterSubHead;
};

/**
 * Get All
 */
exports.getAllMasterSubHead = async (options = {}) => {
	logger.info('Fetching all Sub Heads');
	return await masterSubHeadRepo.findAll(
		{},
		{
			include: [
				{
					model: organization,
					as: 'organization',
					attributes: ['org_code', 'org_name'],
				},
			],
			...options,
		},
	);
};

/**
 * Get By ID
 */
exports.getMasterSubHeadById = async (id) => {
	const MasterSubHead = await masterSubHeadRepo.findById(id);

	if (!MasterSubHead) {
		logger.warn('Sub Head not found', { id });
		throw new AppError('Sub Head not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Sub Head fetched', { id });

	return MasterSubHead;
};

/**
 * Delete
 */
exports.deleteMasterSubHead = async (id) => {
	const MasterSubHead = await masterSubHeadRepo.findById(id);

	if (!MasterSubHead) {
		logger.warn('Sub Head not found for delete', { id });
		throw new AppError('Sub Head not found', StatusCodes.NOT_FOUND);
	}

	await masterSubHeadRepo.delete(MasterSubHead);

	logger.info('Sub Head deleted', { id });

	return true;
};

exports.latestSubCode = async (id) => {
	const latestSubCode = await masterSubHeadRepo.latestSubCode();

	let subCode = 1;
	if (latestSubCode) {
		subCode = latestSubCode.id + 1;
	}

	logger.warn('Sub head latest code', { subCode });
	return subCode;
};
