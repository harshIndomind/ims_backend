const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {masterMajorHeadRepo} = require('../repository/index');
const logger = require('../utils/logger');
const { off } = require('pdfkit');

/**
 * Create
 */
exports.createMasterMajorHead = async (payload) => {
	const { m_code, m_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while creating Master Major Head', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST
		);
	}

	const masterMajorHead = await masterMajorHeadRepo.create({
		m_code,
		m_name,
	});

	logger.info('Master Major Head created', {
		id: masterMajorHead.id,
		m_code: masterMajorHead.m_code,
	});

	return masterMajorHead;
};

/**
 * Update
 */
exports.updateMasterMajorHead = async (id, payload) => {
	const { m_code, m_name } = payload;

	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found for update', { id });
		throw new AppError(
			'Master Major Head not found',
			StatusCodes.NOT_FOUND
		);
	}

	await masterMajorHeadRepo.update(masterMajorHead, {
		m_code,
		m_name,
	});

	logger.info('Master Major Head updated', {
		id,
	});

	return masterMajorHead;
};

/**
 * Get All
 */
exports.getAllMasterMajorHead = async (options = {}) => {
	logger.info('Fetching all Master Major Heads');
	return await masterMajorHeadRepo.findAll({}, options);
};

/**
 * Get By ID
 */
exports.getMasterMajorHeadById = async (id) => {
	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found', { id });
		throw new AppError(
			'Master Major Head not found',
			StatusCodes.NOT_FOUND
		);
	}

	logger.info('Master Major Head fetched', { id });

	return masterMajorHead;
};

/**
 * Delete
 */
exports.deleteMasterMajorHead = async (id) => {
	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found for delete', { id });
		throw new AppError(
			'Master Major Head not found',
			StatusCodes.NOT_FOUND
		);
	}

	await masterMajorHeadRepo.delete(masterMajorHead);

	logger.info('Master Major Head deleted', { id });

	return true;
};
