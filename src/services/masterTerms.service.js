const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTermsRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { organization } = require('../models/index');
const {Op} = require("sequelize")
exports.createMasterTerms = async (req, payload) => {
	const { org_id } = req.user;
	const { m_code, m_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while creating Master Terms', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const masterTerms = await masterTermsRepository.create({
		org_id,
		m_code,
		m_name,
	});

	logger.info('Master Terms created', {
		id: masterTerms.id,
		m_code: masterTerms.m_code,
	});

	return masterTerms;
};

exports.updateMasterTerms = async (id, payload) => {
	const { m_code, m_name } = payload;

	const masterTerms = await masterTermsRepository.findById(id);

	if (!masterTerms) {
		logger.warn('Master Terms not found for update', { id });
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

	await masterTermsRepository.update(masterTerms, {
		m_code,
		m_name,
	});

	logger.info('Master Terms updated', {
		id,
	});

	return masterTerms;
};

exports.getAllMasterTerms = async (req) => {
	logger.info('Fetching all Master Major Heads');
	const {
		limit,
		offset,
		search
	} = req.query;

	
	const where = {
		terms_type: {
        [Op.like]: `%${search || ''}%`,
      },
	}

	const filterOptions = {
		where,
		include: [],
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}
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
