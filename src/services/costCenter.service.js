const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { costCenterRepository } = require('../repository/index');
const logger = require('../utils/logger');
const {
	organization,
	MasterAccount,
	Budget,
	PaymentRequisition,
	MasterSubHeadCostCenterAmount,
} = require('../models/index');

exports.createCostCenter = async (req, payload) => {
	const { org_id } = req.user;
	const { code, name, station_code, account_id, is_lock } = payload;

	const costCenter = await costCenterRepository.create({
		org_id,
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center created', {
		id: costCenter.id,
		org_id: costCenter.org_id,
		code: costCenter.code,
		name: costCenter.name,
		station_code: costCenter.station_code,
		account_id: costCenter.account_id,
		is_lock: costCenter.is_lock,
	});

	return costCenter;
};

exports.updateCostCenter = async (id, payload) => {
	const { code, name, station_code, account_id, is_lock } = payload;

	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found for update', { id });
		throw new AppError('Cost Center not found', StatusCodes.NOT_FOUND);
	}

	await costCenterRepository.update(costCenter, {
		code,
		name,
		station_code,
		account_id,
		is_lock,
	});

	logger.info('Cost center updated', {
		id,
	});

	return costCenter;
};

exports.getAllCostCenter = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, is_lock } = req.query;

	const where = { org_id };

	if(is_lock !== undefined) {
		where.is_lock = is_lock;
	}
	const options = {};
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset);
	}

	options.include = [
		{
			model: organization,
			as: 'organization',
			attributes: ['org_code', 'org_name'],
		},
		{
			model: MasterAccount,
			as: 'account',
			attributes: ['id', 'A_NAME', 'A_CODE'],
		},
	];
	return await costCenterRepository.findAll(where, options);
};

exports.getCostCenterById = async (id) => {
	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Cost center fetched', { id });

	return costCenter;
};

exports.deleteCostCenter = async (id) => {
	const costCenter = await costCenterRepository.findById(id);

	if (!costCenter) {
		logger.warn('Cost center not found for delete', { id });
		throw new AppError('Cost center not found', StatusCodes.NOT_FOUND);
	}

	// MasterSubHeadCostCenterAmounts.cost_center_id is ON DELETE CASCADE — deleting
	// unguarded would silently wipe out cost-center-wise amount allocations.
	const costCenterAmountCount = await MasterSubHeadCostCenterAmount.count({ where: { cost_center_id: id } });
	if (costCenterAmountCount > 0) {
		throw new AppError(
			'Cannot delete this Cost Center because cost-center-wise amounts have already been allocated against it. Remove those allocations first.',
			StatusCodes.CONFLICT,
		);
	}

	// Budgets.cost_center_id and PaymentRequisitions.cost_center_id are ON DELETE SET
	// NULL, so the DB would let this through — but that would silently strip cost-center
	// attribution from budgets/payment requisitions that already exist, breaking their
	// accounting trail. Block explicitly instead.
	const budgetCount = await Budget.count({ where: { cost_center_id: id } });
	if (budgetCount > 0) {
		throw new AppError(
			'Cannot delete this Cost Center because it is already used in one or more Budgets. Remove it from those budgets first.',
			StatusCodes.CONFLICT,
		);
	}

	const paymentRequisitionCount = await PaymentRequisition.count({ where: { cost_center_id: id } });
	if (paymentRequisitionCount > 0) {
		throw new AppError(
			'Cannot delete this Cost Center because it is already used in one or more Payment Requisitions. Remove it from those payment requisitions first.',
			StatusCodes.CONFLICT,
		);
	}

	await costCenterRepository.delete(costCenter);

	logger.info('Cost center deleted', { id });

	return true;
};
