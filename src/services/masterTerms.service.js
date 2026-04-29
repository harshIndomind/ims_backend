const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTermsRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.createMasterTerms = async (req, payload) => {
	const { org_id } = req.user;
	const { terms_type } = payload;

	if (!terms_type) {
		logger.warn('Validation failed while creating Master Terms', payload);
		throw new AppError('Terms type is required', StatusCodes.BAD_REQUEST);
	}

	const masterTerms = await masterTermsRepository.create({
		org_id,
		terms_type,
	});

	logger.info('Master Terms created', { id: masterTerms.id });

	return masterTerms;
};

exports.updateMasterTerms = async (id, payload) => {
	const { terms_type } = payload;

	if (!terms_type) {
		logger.warn('Validation failed while updating Master Terms', payload);
		throw new AppError('Terms type is required', StatusCodes.BAD_REQUEST);
	}

	const masterTerms = await masterTermsRepository.findById(id);

	if (!masterTerms) {
		logger.warn('Master Terms not found for update', { id });
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

	await masterTermsRepository.update(masterTerms, { terms_type });

	logger.info('Master Terms updated', { id });

	return masterTerms;
};

exports.getAllMasterTerms = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search } = req.query;

	const where = {
		org_id: Number(org_id),
		terms_type: {
			[Op.like]: `%${search || ''}%`,
		},
	};

	const filterOptions = { where };

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	logger.info('Fetching all Master Terms', {filterOptions});
	return await masterTermsRepository.findAll({}, filterOptions);
};

exports.getMasterTermsById = async (id) => {
	const masterTerms = await masterTermsRepository.findById(id);

	if (!masterTerms) {
		logger.warn('Master Terms not found', { id });
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Terms fetched', { id });

	return masterTerms;
};

exports.deleteMasterTerms = async (id) => {
	const masterTerms = await masterTermsRepository.findById(id);

	if (!masterTerms) {
		logger.warn('Master Terms not found for delete', { id });
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

	await masterTermsRepository.delete(masterTerms);

	logger.info('Master Terms deleted', { id });

	return true;
};
