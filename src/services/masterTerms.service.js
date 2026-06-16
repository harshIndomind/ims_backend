const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTermsRepository } = require('../repository/index');
const { MasterTermCategory } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.createMasterTerms = async (req, payload) => {
	const { org_id } = req.user;
	const { terms_type, category_id } = payload;   

	if (!terms_type) {
		throw new AppError('Terms type is required', StatusCodes.BAD_REQUEST);
	}

	const masterTerms = await masterTermsRepository.create({
		org_id,
		terms_type,
		category_id: category_id || null,    
	});

	return masterTerms;
};

exports.updateMasterTerms = async (id, payload) => {
	const { terms_type, category_id } = payload;   

	if (!terms_type) {
		throw new AppError('Terms type is required', StatusCodes.BAD_REQUEST);
	}

	const masterTerms = await masterTermsRepository.findById(id);

	if (!masterTerms) {
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

	await masterTermsRepository.update(masterTerms, {
		terms_type,
		category_id: category_id || null,    // ← add this
	});

	return masterTerms;
};

exports.getAllMasterTerms = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search } = req.query;

	const where = {
		org_id: Number(org_id),
		terms_type: { [Op.like]: `%${search || ''}%` },
	};

	const filterOptions = {
		where,
		include: [
			{
				model: MasterTermCategory,
				as: 'category',
				attributes: ['id', 'category_name', 'category_code'],
			},
		],
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	logger.info('Fetching all Master Terms', { filterOptions });
	return await masterTermsRepository.findAll({}, filterOptions);
}; 	

exports.getMasterTermsById = async (id) => {
	const masterTerms = await masterTermsRepository.findById(id, {
		include: [
			{
				model: MasterTermCategory,
				as: 'category',
				attributes: ['id', 'category_name', 'category_code'],
			},
		],
	});

	if (!masterTerms) {
		throw new AppError('Master Terms not found', StatusCodes.NOT_FOUND);
	}

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
