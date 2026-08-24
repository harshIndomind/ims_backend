const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterSubHeadRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { organization, MasterSubHeadAmount } = require('../models/index');
const { Op } = require('sequelize');

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

	const amountCount = await MasterSubHeadAmount.count({
		where: { sub_head_id: id },
	});
	if (amountCount > 0) {
		logger.warn('Blocked update of Sub Head with amounts assigned', { id, amountCount });
		throw new AppError(
			'Cannot update this sub head — amounts are already assigned to it in Sub Head Amount.',
			StatusCodes.CONFLICT,
		);
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
exports.getAllMasterSubHead = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, major_head_id, period_id, search, sortOrder } = req.query;

	const where = { org_id };

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

	if (search) {
		const like = `%${search}%`;
		where[Op.or] = [
			{ sh_code: { [Op.like]: like } },
			{ sh_name: { [Op.like]: like } },
		];
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
			],
			order: [['createdAt', String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC']],
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

	const amountCount = await MasterSubHeadAmount.count({
		where: { sub_head_id: id },
	});
	MasterSubHead.dataValues.has_amount = amountCount > 0;

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
