const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { rateContractRepositoy } = require('../repository/index');
const logger = require('../utils/logger');
const {
	organization,
	RateContractUnitSupplier,
	RateContractUnitItem,
	sequelize,
} = require('../models/index');
const { Op } = require('sequelize');
exports.createRateContract = async (req, payload) => {
	const t = await sequelize.transaction();

	try {
		const { org_id } = req.user;

		const {
			supplier_id,
			product_id,
			uom_id,
			productSnapshot,
			name,
			address1,
			address2,
			unit_product_mapping = [],
			unit_supplier_mapping = [],
			contract_subject,
			universalCode,
			universal_code,
			specification,
			discount = 0,
			effective_date,
			end_date,
			contract_rate = 0,
			special_discount = 0,
			special_discount_details,
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			others,
		} = payload;

		// ✅ Validation
		if (!supplier_id || !contract_subject) {
			throw new AppError(
				'Supplier and contract subject are required',
				StatusCodes.BAD_REQUEST,
			);
		}

		// ✅ Supplier Snapshot (important for audit/history)
		const supplierSnapshot = {
			universal_code,
			name,
			address1,
			address2,
		};

		// ✅ Create Rate Contract
		const rateContract = await rateContractRepositoy.create(
			{
				org_id,
				supplier_id,
				supplierSnapshot,
				product_id,
				uom_id: uom_id ?? null,
				productSnapshot,
				contract_subject,
				universal_code,
				specification,
				contract_rate,
				discount,
				special_discount,
				special_discount_details,
				effective_date,
				end_date,
				price_term_id,
				gst_term_id,
				payment_term_id,
				delivery_term_id,
				pf_term_id,
				ld_clause_term_id,
				dispatch_id,
				others,
			},
			{ transaction: t },
		);

		// ✅ 1. Unit → Supplier Mapping
		const unitSupplierData = unit_supplier_mapping.map((u) => ({
			rate_contract_id: rateContract.id,
			unit_id: u.unitId,
			supplier_id: u.partner_id,
		}));

		if (unitSupplierData.length) {
			await RateContractUnitSupplier.bulkCreate(unitSupplierData, {
				transaction: t,
			});
		}

		// ✅ 2. Unit → Product Mapping (only checked items)
		const selectedUnits = unit_product_mapping.filter((item) => item.isChecked);

		const unitProductData = selectedUnits.map((item) => ({
			rate_contract_id: rateContract.id,
			unit_id: item.unitId,
			product_id,
		}));

		if (unitProductData.length) {
			await RateContractUnitItem.bulkCreate(unitProductData, {
				transaction: t,
			});
		}

		await t.commit();

		logger.info('Rate Contract created', {
			id: rateContract.id,
		});

		return rateContract;
	} catch (error) {
		await t.rollback();
		logger.error('Error creating Rate Contract', error);
		throw error;
	}
};

exports.updateRateContract = async (id, payload) => {
	const { m_code, m_name } = payload;

	const masterTerms = await rateContractRepositoy.findById(id);

	if (!masterTerms) {
		logger.warn('Rate Contract not found for update', { id });
		throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
	}

	await rateContractRepositoy.update(masterTerms, {
		m_code,
		m_name,
	});

	logger.info('Rate Contract updated', {
		id,
	});

	return masterTerms;
};

exports.getAllRateContract = async (req) => {
	logger.info('Fetching all Rate Contract');
	const { limit, offset } = req.query;

	const filterOptions = {
		include: [
			{
				model: organization,
				as: 'organization',
			},
			{
				model: RateContractUnitSupplier,
				as: 'unit_supplier_mapping',
			},
			{
				model: RateContractUnitItem,
				as: 'unit_product_mapping',
			},
		],
	};

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
		filterOptions.distinct = true;
	}
	return await rateContractRepositoy.findAll({}, filterOptions);
};

exports.getRateContractById = async (id) => {
	const masterTerms = await rateContractRepositoy.findById(id, {
		include: [
			{
				model: organization,
				as: 'organization',
			},
			{
				model: RateContractUnitSupplier,
				as: 'unit_supplier_mapping',
			},
			{
				model: RateContractUnitItem,
				as: 'unit_product_mapping',
			},
		],
	});

	if (!masterTerms) {
		logger.warn('Rate Contract not found', { id });
		throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Rate Contract fetched', { id });

	return masterTerms;
};

exports.deleteRateContract = async (id) => {
	const rateContract = await rateContractRepositoy.findById(id);

	if (!rateContract) {
		logger.warn('Rate Contract not found for delete', { id });
		throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
	}

	await rateContractRepositoy.delete(rateContract);

	logger.info('Rate Contract deleted', { id });

	return true;
};
