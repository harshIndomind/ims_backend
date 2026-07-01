const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { organization, MasterMajorHead, MasterSubHeadAmount } = require('../models/index');
const { Op } = require('sequelize');

/**
 * Create
 */
exports.createMasterSubHead = async (req, payload) => {
	const { org_id } = req.user;
	const { sh_code, sh_name, major_head_id } = payload;

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
		...(major_head_id ? { major_head_id: Number(major_head_id) } : {}),
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
	const { sh_code, sh_name, major_head_id } = payload;

	const MasterSubHead = await masterSubHeadRepo.findById(id);

	if (!MasterSubHead) {
		logger.warn('Sub Head not found for update', { id });
		throw new AppError('Sub Head not found', StatusCodes.NOT_FOUND);
	}

	await masterSubHeadRepo.update(MasterSubHead, {
		sh_code,
		sh_name,
		...(major_head_id !== undefined ? { major_head_id: major_head_id ? Number(major_head_id) : null } : {}),
	});

	logger.info('Sub Head updated', {
		id,
	});

	return MasterSubHead;
};

/**
 * Get All
 */
exports.getAllMasterSubHead = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, major_head_id, period_id } = req.query;

	const where = { org_id };
	if (major_head_id) {
		where.major_head_id = Number(major_head_id);
	}

	if (period_id) {
		const amountWhere = { org_id, period_id: Number(period_id) };
		if (major_head_id) amountWhere.major_head_id = Number(major_head_id);
		const amounts = await MasterSubHeadAmount.findAll({
			where: amountWhere,
			attributes: ['sub_head_id'],
		});
		const subHeadIds = amounts.map((a) => a.sub_head_id);
		where.id = { [Op.in]: subHeadIds };
	}

	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}
	logger.info('Fetching all Sub Heads', { major_head_id, period_id });
	return await masterSubHeadRepo.findAll(
		where,
		{
			include: [
				{
					model: organization,
					as: 'organization',
					attributes: ['org_code', 'org_name'],
				},
				{
					model: MasterMajorHead,
					as: 'majorHead',
					attributes: ['id', 'm_code', 'm_name'],
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
