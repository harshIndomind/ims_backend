const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { rateContractRepositoy } = require('../repository/index');
const logger = require('../utils/logger');
const {
	organization,
	RateContract,
	RateContractUnitSupplier,
	RateContractUnitItem,
	RateContractProduct,
	sequelize,
} = require('../models/index');
const { Op } = require('sequelize');

const defaultIncludes = [
	{ model: organization, as: 'organization' },
	{ model: RateContractUnitSupplier, as: 'unit_supplier_mapping' },
	{ model: RateContractUnitItem, as: 'unit_product_mapping' },
	{ model: RateContractProduct, as: 'products' },
];

exports.createRateContract = async (req, payload) => {
	const t = await sequelize.transaction();

	try {
		const { org_id } = req.user;

		const {
			supplier_id,
			products = [],
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
			price_term_id,
			gst_term_id,
			payment_term_id,
			delivery_term_id,
			pf_term_id,
			ld_clause_term_id,
			dispatch_id,
			others,
		} = payload;

		if (!supplier_id || !contract_subject) {
			throw new AppError(
				'Supplier and contract subject are required',
				StatusCodes.BAD_REQUEST,
			);
		}

		if (!products.length) {
			throw new AppError(
				'At least one product is required',
				StatusCodes.BAD_REQUEST,
			);
		}

		const supplierSnapshot = { universal_code, name, address1, address2 };

		const rateContract = await rateContractRepositoy.create(
			{
				org_id,
				supplier_id,
				supplierSnapshot,
				contract_subject,
				universal_code,
				specification,
				discount,
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

		// Products
		const productData = products.map((p) => ({
			rate_contract_id: rateContract.id,
			product_id: p.product_id,
			productSnapshot: p.productSnapshot ?? null,
			uom_id: p.uom_id ?? null,
			contract_rate: p.contract_rate ?? 0,
			special_discount: p.special_discount ?? 0,
			special_discount_details: p.special_discount_details ?? null,
		}));

		await RateContractProduct.bulkCreate(productData, { transaction: t });

		// Unit → Supplier Mapping (only rows with a selected supplier)
		const unitSupplierData = unit_supplier_mapping
			.filter((u) => u.partner_id && u.partner_id !== 'null' && u.partner_id !== '-1')
			.map((u) => ({
				rate_contract_id: rateContract.id,
				unit_id: u.unitId,
				supplier_id: Number(u.partner_id),
			}));

		if (unitSupplierData.length) {
			await RateContractUnitSupplier.bulkCreate(unitSupplierData, { transaction: t });
		}

		// Unit → Product Mapping (checked units only, mapped to every product)
		const selectedUnits = unit_product_mapping.filter((item) => item.isChecked);
		const unitProductData = selectedUnits.flatMap((item) =>
			products.map((p) => ({
				rate_contract_id: rateContract.id,
				unit_id: item.unitId,
				product_id: p.product_id,
			})),
		);

		if (unitProductData.length) {
			await RateContractUnitItem.bulkCreate(unitProductData, { transaction: t });
		}

		await t.commit();
		logger.info('Rate Contract created', { id: rateContract.id });
		return rateContract;
	} catch (error) {
		await t.rollback();
		logger.error('Error creating Rate Contract', error);
		throw error;
	}
};

exports.updateRateContract = async (id, payload) => {
	const t = await sequelize.transaction();

	try {
		const rateContract = await rateContractRepositoy.findById(id);

		if (!rateContract) {
			logger.warn('Rate Contract not found for update', { id });
			throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
		}

		const {
			supplier_id,
			products = [],
			name,
			address1,
			address2,
			unit_product_mapping = [],
			unit_supplier_mapping = [],
			contract_subject,
			universal_code,
			specification,
			discount = 0,
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
		} = payload;

		const supplierSnapshot = { universal_code, name, address1, address2 };

		await rateContractRepositoy.update(
			rateContract,
			{
				supplier_id,
				supplierSnapshot,
				contract_subject,
				universal_code,
				specification,
				discount,
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

		// Replace products
		await RateContractProduct.destroy({ where: { rate_contract_id: id }, transaction: t });
		const productData = products.map((p) => ({
			rate_contract_id: id,
			product_id: p.product_id,
			productSnapshot: p.productSnapshot ?? null,
			uom_id: p.uom_id ?? null,
			contract_rate: p.contract_rate ?? 0,
			special_discount: p.special_discount ?? 0,
			special_discount_details: p.special_discount_details ?? null,
		}));
		await RateContractProduct.bulkCreate(productData, { transaction: t });

		// Replace unit supplier mapping (only rows with a selected supplier)
		await RateContractUnitSupplier.destroy({ where: { rate_contract_id: id }, transaction: t });
		const unitSupplierData = unit_supplier_mapping
			.filter((u) => u.partner_id && u.partner_id !== 'null' && u.partner_id !== '-1')
			.map((u) => ({
				rate_contract_id: id,
				unit_id: u.unitId,
				supplier_id: Number(u.partner_id),
			}));
		if (unitSupplierData.length) {
			await RateContractUnitSupplier.bulkCreate(unitSupplierData, { transaction: t });
		}

		// Replace unit product mapping (checked units only, mapped to every product)
		await RateContractUnitItem.destroy({ where: { rate_contract_id: id }, transaction: t });
		const selectedUnits = unit_product_mapping.filter((item) => item.isChecked);
		const unitProductData = selectedUnits.flatMap((item) =>
			products.map((p) => ({
				rate_contract_id: id,
				unit_id: item.unitId,
				product_id: p.product_id,
			})),
		);
		if (unitProductData.length) {
			await RateContractUnitItem.bulkCreate(unitProductData, { transaction: t });
		}

		await t.commit();
		logger.info('Rate Contract updated', { id });
		return rateContract;
	} catch (error) {
		await t.rollback();
		logger.error('Error updating Rate Contract', error);
		throw error;
	}
};

exports.getAllRateContract = async (req) => {
	logger.info('Fetching all Rate Contract');
	const { limit, offset } = req.query;

	const filterOptions = { include: defaultIncludes };

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
		filterOptions.distinct = true;
	}
	return await rateContractRepositoy.findAll({}, filterOptions);
};

exports.getRateContractById = async (id) => {
	const rateContract = await rateContractRepositoy.findById(id, {
		include: defaultIncludes,
	});

	if (!rateContract) {
		logger.warn('Rate Contract not found', { id });
		throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Rate Contract fetched', { id });
	return rateContract;
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

exports.getRateContractByProductId = async (product_id, { unit_id, date } = {}) => {
	// Find a rate contract that contains this product in its products list
	const productRecord = await RateContractProduct.findOne({
		where: { product_id: Number(product_id) },
		include: [
			{
				model: RateContract,
				as: 'rateContract',
				include: defaultIncludes,
			},
		],
	});

	if (!productRecord) return null;

	const rc = productRecord.rateContract.toJSON();
	logger.debug("Rate Contract", {rc})
	// Rate contract only applies to the selected unit if it's mapped for this product.
	// If it isn't (or the date is outside the contract's validity period), treat it as
	// "no applicable rate contract" so the caller falls back to the product's own price/UOM
	// instead of surfacing an error.
	const unitMappings = rc.unit_product_mapping || [];
	if (unit_id && unitMappings.length > 0) {
		const isUnitMapped = unitMappings.some(
			(mapping) =>
				Number(mapping.unit_id) === Number(unit_id) &&
				Number(mapping.product_id) === Number(product_id)
		);

		if (!isUnitMapped) return null;
	}

	if (date) {
		const checkDate = new Date(date);
		const effectiveDate = rc.effective_date ? new Date(rc.effective_date) : null;
		const endDate = rc.end_date ? new Date(rc.end_date) : null;

		if (effectiveDate) effectiveDate.setHours(0, 0, 0, 0);
		if (endDate) endDate.setHours(23, 59, 59, 999);
		checkDate.setHours(12, 0, 0, 0);

		if ((effectiveDate && checkDate < effectiveDate) || (endDate && checkDate > endDate)) {
			return null;
		}
	}

	// Return rate contract with the matched product's rate data merged at the top level
	// for backward compatibility with PO/WO/Budget/Indent forms
	rc.contract_rate = productRecord.contract_rate;
	rc.uom_id = productRecord.uom_id;
	rc.special_discount = productRecord.special_discount;
	rc.special_discount_details = productRecord.special_discount_details;
	rc.product_id = productRecord.product_id;
	rc.productSnapshot = productRecord.productSnapshot;

	return rc;
};
