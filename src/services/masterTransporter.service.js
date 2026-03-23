const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTransporterRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { organization } = require('../models/index');
const {Op} = require('sequelize');

exports.createMasterTransporter = async (req, payload) => {
	const { org_id } = req.user;
	const { m_code, m_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while creating Master Transporter', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const masterMajorHead = await masterTransporterRepository.create({
		org_id,
		m_code,
		m_name,
	});

	logger.info('Master Transporter created', {
		id: masterMajorHead.id,
		m_code: masterMajorHead.m_code,
	});

	return masterMajorHead;
};

exports.updateMasterTransporter = async (id, payload) => {
	const { m_code, m_name } = payload;

	const masterMajorHead = await masterTransporterRepository.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Transporter not found for update', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	await masterTransporterRepository.update(masterMajorHead, {
		m_code,
		m_name,
	});

	logger.info('Master Transporter updated', {
		id,
	});

	return masterMajorHead;
};

exports.getAllMasterTransporter = async (req) => {
	logger.info('Fetching all Master Transporters');

	const { limit, offset, search } = req.query;

	const where = {
		name: {
			[Op.like]: `%${search || ''}%`,
		},
	};

	const filterOptions = {
		where,
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}
	return await masterTransporterRepository.findAll({}, filterOptions);
};

exports.getMasterTransporterById = async (id) => {
	const masterMajorHead = await masterTransporterRepository.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Transporter not found', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Transporter fetched', { id });

	return masterMajorHead;
};

exports.deleteMasterTransporter = async (id) => {
	const masterMajorHead = await masterTransporterRepository.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Transporter not found for delete', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	await masterTransporterRepository.delete(masterMajorHead);

	logger.info('Master Transporter deleted', { id });

	return true;
};
