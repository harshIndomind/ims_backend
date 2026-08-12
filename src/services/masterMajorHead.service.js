const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterMajorHeadRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { organization, MasterMajorHeadAmount } = require('../models/index');
const { Op } = require('sequelize');

exports.createMasterMajorHead = async (req, payload) => {
	const { org_id } = req.user;
	const { m_code, m_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while creating Master Major Head', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const masterMajorHead = await masterMajorHeadRepo.create({
		org_id,
		m_code,
		m_name,
	});

	logger.info('Master Major Head created', {
		id: masterMajorHead.id,
		m_code: masterMajorHead.m_code,
	});

	return masterMajorHead;
};

exports.updateMasterMajorHead = async (id, payload) => {
	const { m_code, m_name } = payload;

	if (!m_code || !m_name) {
		logger.warn('Validation failed while updating Master Major Head', payload);
		throw new AppError(
			'Major head code and name are required',
			StatusCodes.BAD_REQUEST,
		);
	}

	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found for update', { id });
		throw new AppError('Master Major Head not found', StatusCodes.NOT_FOUND);
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

exports.getAllMasterMajorHead = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, period_id, search, sortOrder } = req.query;
	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	const where = { org_id: Number(org_id) };

	if (period_id) {
		const amounts = await MasterMajorHeadAmount.findAll({
			where: { org_id: Number(org_id), period_id: Number(period_id) },
			attributes: ['major_head_id'],
		});
		const majorHeadIds = amounts.map((a) => a.major_head_id);
		where.id = { [Op.in]: majorHeadIds };
	}

	if (search) {
		const like = `%${search}%`;
		where[Op.or] = [
			{ m_code: { [Op.like]: like } },
			{ m_name: { [Op.like]: like } },
		];
	}

	options.order = [['createdAt', String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC']];
	options.include = [
		{
			model: organization,
			as: 'organization',
			attributes: ['org_code', 'org_name'],
		},
	];
	return await masterMajorHeadRepo.findAll(where, options);
};

exports.getMasterMajorHeadById = async (id) => {
	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found', { id });
		throw new AppError('Master Major Head not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Master Major Head fetched', { id });

	return masterMajorHead;
};

exports.deleteMasterMajorHead = async (id) => {
	const masterMajorHead = await masterMajorHeadRepo.findById(id);

	if (!masterMajorHead) {
		logger.warn('Master Major Head not found for delete', { id });
		throw new AppError('Master Major Head not found', StatusCodes.NOT_FOUND);
	}

	await masterMajorHeadRepo.delete(masterMajorHead);

	logger.info('Master Major Head deleted', { id });

	return true;
};
