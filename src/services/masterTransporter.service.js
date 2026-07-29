const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTransporterRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.createMasterTransporter = async (req, payload) => {
	const { org_id } = req.user;
	const { name, address1, address2, contactNo } = payload;

	if (!name || !address1) {
		logger.warn('Validation failed while creating Master Transporter', payload);
		throw new AppError('Name and address are required', StatusCodes.BAD_REQUEST);
	}

	const masterTransporter = await masterTransporterRepository.create({
		org_id,
		name,
		address1,
		address2: address2 || null,
		contactNo: contactNo || null,
	});

	logger.info('Master Transporter created', { id: masterTransporter.id });

	return masterTransporter;
};

exports.updateMasterTransporter = async (id, payload) => {
	const { name, address1, address2, contactNo } = payload;

	if (!name || !address1) {
		logger.warn('Validation failed while updating Master Transporter', payload);
		throw new AppError('Name and address are required', StatusCodes.BAD_REQUEST);
	}

	const masterTransporter = await masterTransporterRepository.findById(id);

	if (!masterTransporter) {
		logger.warn('Master Transporter not found for update', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	await masterTransporterRepository.update(masterTransporter, {
		name,
		address1,
		address2: address2 || null,
		contactNo: contactNo || null,
	});

	logger.info('Master Transporter updated', { id });

	return masterTransporter;
};

exports.getAllMasterTransporter = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search } = req.query;

	const where = {
		org_id: Number(org_id),
		name: {
			[Op.like]: `%${search || ''}%`,
		},
	};

	const filterOptions = { where };

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	return await masterTransporterRepository.findAll({}, filterOptions);
};

exports.getMasterTransporterById = async (id) => {
	const masterTransporter = await masterTransporterRepository.findById(id);

	if (!masterTransporter) {
		logger.warn('Master Transporter not found', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Transporter fetched', { id });

	return masterTransporter;
};

exports.deleteMasterTransporter = async (id) => {
	const masterTransporter = await masterTransporterRepository.findById(id);

	if (!masterTransporter) {
		logger.warn('Master Transporter not found for delete', { id });
		throw new AppError('Master Transporter not found', StatusCodes.NOT_FOUND);
	}

	await masterTransporterRepository.delete(masterTransporter);

	logger.info('Master Transporter deleted', { id });

	return true;
};
