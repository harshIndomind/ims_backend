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

		if (effective_date && end_date && new Date(end_date) < new Date(effective_date)) {
			throw new AppError(
				'End Date must be on or after Effective Date',
				StatusCodes.BAD_REQUEST,
			);
		}

		// Block creation when an approved RC for this supplier already covers any of the same products
		// AND its date range overlaps with the new RC's date range.
		// Two ranges overlap when: existing.start <= new.end AND existing.end >= new.start.
		// A null end_date means open-ended (no expiry), so it always extends past any start date.
		const productIds = products.map((p) => Number(p.product_id)).filter(Boolean);
		if (productIds.length && effective_date) {
			const dateOverlapWhere = {
				// existing.effective_date <= new.end_date  (or new has no end → always true)
				...(end_date ? { effective_date: { [Op.lte]: new Date(end_date) } } : {}),
				// existing.end_date >= new.effective_date  (or existing has no end → open-ended)
				[Op.or]: [
					{ end_date: null },
					{ end_date: { [Op.gte]: new Date(effective_date) } },
				],
			};
			const conflict = await RateContract.findOne({
				where: { org_id, supplier_id, status: 'approved', ...dateOverlapWhere },
				include: [{
					model: RateContractProduct,
					as: 'products',
					where: { product_id: { [Op.in]: productIds } },
					required: true,
				}],
				subQuery: false,
			});
			if (conflict) {
				throw new AppError(
					`Rate Contract ${conflict.family_number} V${conflict.version_number} is already approved for this supplier, covers one or more of the same products, and its date range overlaps with the new contract. Open that RC and use "New Version" to create a revision.`,
					StatusCodes.CONFLICT,
				);
			}
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
				status: 'draft',
				version_number: 1,
			},
			{ transaction: t },
		);

		// Assign family_number based on the auto-incremented PK — done as a separate update
		// so the ID is known before we build the human-readable code.
		const familyNumber = `RC-${String(rateContract.id).padStart(4, '0')}`;
		await rateContract.update({ family_number: familyNumber }, { transaction: t });

		// Products
		const productData = products.map((p) => ({
			rate_contract_id: rateContract.id,
			product_id: p.product_id,
			productSnapshot: p.productSnapshot ?? null,
			uom_id: p.uom_id ?? null,
			contract_rate: p.contract_rate ?? 0,
			discount: p.discount ?? 0,
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
		logger.info('Rate Contract created', { id: rateContract.id, family_number: familyNumber });
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

		if (rateContract.status !== 'draft') {
			throw new AppError(
				`Rate Contract cannot be edited because its status is '${rateContract.status}'. ` +
				'Only Draft Rate Contracts can be modified. To change an approved contract, create a new version instead.',
				StatusCodes.CONFLICT,
			);
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
			discount: p.discount ?? 0,
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

	if (rateContract.status !== 'draft') {
		throw new AppError(
			`Rate Contract cannot be deleted because its status is '${rateContract.status}'. ` +
			'Only Draft Rate Contracts can be deleted.',
			StatusCodes.CONFLICT,
		);
	}

	await rateContractRepositoy.delete(rateContract);
	logger.info('Rate Contract deleted', { id });
	return true;
};

exports.approveRateContract = async (id, user) => {
	const t = await sequelize.transaction();

	try {
		const rateContract = await rateContractRepositoy.findById(id, { transaction: t, lock: t.LOCK.UPDATE });

		if (!rateContract) {
			throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
		}

		if (rateContract.status !== 'draft') {
			throw new AppError(
				`Rate Contract cannot be approved because its status is '${rateContract.status}'.`,
				StatusCodes.CONFLICT,
			);
		}

		// Guard against approving a duplicate RC that conflicts with an already-approved one.
		// New-version approvals are exempt — they supersede the parent, so the parent is excluded.
		// Two RCs only conflict when both their product lists AND date ranges overlap.
		const rcProducts = await RateContractProduct.findAll({
			where: { rate_contract_id: Number(id) },
			transaction: t,
		});
		const productIds = rcProducts.map((p) => Number(p.product_id)).filter(Boolean);

		if (productIds.length && rateContract.effective_date) {
			const excludeIds = [Number(id)];
			if (rateContract.parent_rc_id) excludeIds.push(Number(rateContract.parent_rc_id));

			const { effective_date: newStart, end_date: newEnd } = rateContract;
			const dateOverlapWhere = {
				...(newEnd ? { effective_date: { [Op.lte]: new Date(newEnd) } } : {}),
				[Op.or]: [
					{ end_date: null },
					{ end_date: { [Op.gte]: new Date(newStart) } },
				],
			};

			const conflict = await RateContract.findOne({
				where: {
					org_id: rateContract.org_id,
					supplier_id: rateContract.supplier_id,
					status: 'approved',
					id: { [Op.notIn]: excludeIds },
					...dateOverlapWhere,
				},
				include: [{
					model: RateContractProduct,
					as: 'products',
					where: { product_id: { [Op.in]: productIds } },
					required: true,
				}],
				subQuery: false,
				transaction: t,
			});

			if (conflict) {
				throw new AppError(
					`Rate Contract ${conflict.family_number} V${conflict.version_number} is already approved for this supplier, covers one or more of the same products, and its date range overlaps with this contract. Use "New Version" on that RC instead of approving a duplicate.`,
					StatusCodes.CONFLICT,
				);
			}
		}

		const approvedBy = { id: user.id, name: user.name, email: user.email };

		await rateContractRepositoy.update(
			rateContract,
			{
				status: 'approved',
				approved_at: new Date(),
				approved_by: approvedBy,
			},
			{ transaction: t },
		);

		// When a new version is approved, mark the parent as superseded.
		if (rateContract.parent_rc_id) {
			const parent = await rateContractRepositoy.findById(rateContract.parent_rc_id, {
				transaction: t,
				lock: t.LOCK.UPDATE,
			});
			if (parent && parent.status === 'approved') {
				if (rateContract.effective_date && parent.effective_date) {
					const newStart = new Date(rateContract.effective_date);
					const parentStart = new Date(parent.effective_date);
					if (newStart < parentStart) {
						throw new AppError(
							`New version effective date (${rateContract.effective_date}) cannot be before the parent RC's effective date (${parent.effective_date}). Set the effective date to ${parent.effective_date} or later.`,
							StatusCodes.BAD_REQUEST,
						);
					}
				}

				const parentUpdate = {
					status: 'superseded',
					superseded_by_rc_id: rateContract.id,
				};

				// If the new version starts after the parent's start date, trim the parent's
				// end_date to one day before the new version's effective_date. Without this,
				// approving a forward-dated new version immediately removes the parent from
				// active lookups and leaves a gap during which no approved RC exists.
				if (rateContract.effective_date && parent.effective_date) {
					const newStart = new Date(rateContract.effective_date);
					const parentStart = new Date(parent.effective_date);
					if (newStart > parentStart) {
						const trimmedEnd = new Date(newStart);
						trimmedEnd.setDate(trimmedEnd.getDate() - 1);
						parentUpdate.end_date = trimmedEnd;
					}
				}

				await rateContractRepositoy.update(parent, parentUpdate, { transaction: t });
				logger.info('Parent Rate Contract superseded', {
					parent_id: parent.id,
					new_version_id: rateContract.id,
					trimmed_end_date: parentUpdate.end_date ?? null,
				});
			}
		}

		await t.commit();
		logger.info('Rate Contract approved', { id });
		return rateContract;
	} catch (error) {
		await t.rollback();
		logger.error('Error approving Rate Contract', error);
		throw error;
	}
};

exports.createNewVersion = async (id, payload, req) => {
	const t = await sequelize.transaction();

	try {
		const { org_id } = req.user;

		const original = await rateContractRepositoy.findById(id, {
			include: defaultIncludes,
			transaction: t,
		});

		if (!original) {
			throw new AppError('Rate Contract not found', StatusCodes.NOT_FOUND);
		}

		if (original.status !== 'approved') {
			throw new AppError(
				'A new version can only be created from an Approved Rate Contract.',
				StatusCodes.CONFLICT,
			);
		}

		// Merge original fields with any overrides provided in the payload.
		const {
			supplier_id = original.supplier_id,
			products,
			name,
			address1,
			address2,
			unit_product_mapping,
			unit_supplier_mapping,
			contract_subject = original.contract_subject,
			universal_code = original.universal_code,
			specification = original.specification,
			discount = original.discount,
			effective_date,
			end_date,
			price_term_id = original.price_term_id,
			gst_term_id = original.gst_term_id,
			payment_term_id = original.payment_term_id,
			delivery_term_id = original.delivery_term_id,
			pf_term_id = original.pf_term_id,
			ld_clause_term_id = original.ld_clause_term_id,
			dispatch_id = original.dispatch_id,
			others = original.others,
		} = payload;

		const supplierSnapshot = (name || address1 || address2)
			? { universal_code, name, address1, address2 }
			: original.supplierSnapshot;

		const resolvedEffectiveDate = effective_date ?? original.effective_date;
		const resolvedEndDate = end_date ?? original.end_date;

		if (resolvedEffectiveDate && resolvedEndDate && new Date(resolvedEndDate) < new Date(resolvedEffectiveDate)) {
			throw new AppError(
				'End Date must be on or after Effective Date',
				StatusCodes.BAD_REQUEST,
			);
		}

		const newRateContract = await rateContractRepositoy.create(
			{
				org_id,
				supplier_id,
				supplierSnapshot,
				contract_subject,
				universal_code,
				specification,
				discount,
				effective_date: resolvedEffectiveDate,
				end_date: resolvedEndDate,
				price_term_id,
				gst_term_id,
				payment_term_id,
				delivery_term_id,
				pf_term_id,
				ld_clause_term_id,
				dispatch_id,
				others,
				status: 'draft',
				family_number: original.family_number,
				version_number: original.version_number + 1,
				parent_rc_id: original.id,
			},
			{ transaction: t },
		);

		// Products: use overrides if provided, otherwise copy from original
		const sourceProducts = products ?? original.products?.map((p) => p.toJSON?.() ?? p) ?? [];
		const productData = sourceProducts.map((p) => ({
			rate_contract_id: newRateContract.id,
			product_id: p.product_id,
			productSnapshot: p.productSnapshot ?? null,
			uom_id: p.uom_id ?? null,
			contract_rate: p.contract_rate ?? 0,
			discount: p.discount ?? 0,
			special_discount: p.special_discount ?? 0,
			special_discount_details: p.special_discount_details ?? null,
		}));
		await RateContractProduct.bulkCreate(productData, { transaction: t });

		// Unit → Supplier mapping
		const sourceUnitSuppliers = unit_supplier_mapping
			?? original.unit_supplier_mapping?.map((u) => ({
				unitId: u.unit_id,
				partner_id: String(u.supplier_id),
			})) ?? [];
		const unitSupplierData = sourceUnitSuppliers
			.filter((u) => u.partner_id && u.partner_id !== 'null' && u.partner_id !== '-1')
			.map((u) => ({
				rate_contract_id: newRateContract.id,
				unit_id: u.unitId,
				supplier_id: Number(u.partner_id),
			}));
		if (unitSupplierData.length) {
			await RateContractUnitSupplier.bulkCreate(unitSupplierData, { transaction: t });
		}

		// Unit → Product mapping
		const sourceUnitProducts = unit_product_mapping
			?? original.unit_product_mapping?.map((u) => ({
				unitId: u.unit_id,
				product_id: u.product_id,
				isChecked: true,
			})) ?? [];
		const selectedUnits = sourceUnitProducts.filter((item) => item.isChecked);
		const finalProducts = products ?? original.products ?? [];
		const unitProductData = selectedUnits.flatMap((item) =>
			finalProducts.map((p) => ({
				rate_contract_id: newRateContract.id,
				unit_id: item.unitId,
				product_id: p.product_id,
			})),
		);
		if (unitProductData.length) {
			await RateContractUnitItem.bulkCreate(unitProductData, { transaction: t });
		}

		await t.commit();
		logger.info('New Rate Contract version created', {
			original_id: original.id,
			new_id: newRateContract.id,
			family_number: original.family_number,
			version_number: newRateContract.version_number,
		});
		return newRateContract;
	} catch (error) {
		await t.rollback();
		logger.error('Error creating new Rate Contract version', error);
		throw error;
	}
};

exports.getRateContractByProductId = async (product_id, { unit_id, date, org_id, supplier_id } = {}) => {
	// Find the most recently approved rate contract that contains this product.
	// Only 'approved' RCs are eligible — draft/superseded/expired/cancelled are excluded
	// so that historical documents referencing old RCs are never affected by RC lifecycle changes.
	// Step 1: find the most recently approved RC whose date window covers `date`.
	// The date range filter is pushed into SQL so that if the latest RC doesn't cover
	// the requested date we still fall back to an older RC that does.
	// Kept separate from the full include so LIMIT 1 never truncates hasMany associations.
	const rcWhere = { status: 'approved' };
	// Scope to the caller's org so cross-org RCs are never returned.
	if (org_id) rcWhere.org_id = Number(org_id);
	// Scope to the selected vendor so the correct RC is returned when multiple
	// vendors have active contracts for the same product.
	if (supplier_id) rcWhere.supplier_id = Number(supplier_id);
	if (date) {
		const checkDate = new Date(date);
		checkDate.setHours(12, 0, 0, 0);
		rcWhere.effective_date = { [Op.lte]: checkDate };
		rcWhere[Op.or] = [{ end_date: null }, { end_date: { [Op.gte]: checkDate } }];
	}

	const productRecord = await RateContractProduct.findOne({
		where: { product_id: Number(product_id) },
		include: [
			{
				model: RateContract,
				as: 'rateContract',
				where: rcWhere,
				required: true,
				attributes: ['id', 'approved_at'],
			},
		],
		order: [[{ model: RateContract, as: 'rateContract' }, 'approved_at', 'DESC']],
	});

	if (!productRecord) return null;

	// Step 2: reload the full RC with all associations (no LIMIT interference).
	const fullRc = await RateContract.findByPk(productRecord.rateContract.id, {
		include: defaultIncludes,
	});

	if (!fullRc) return null;

	const rc = fullRc.toJSON();
	logger.debug('Rate Contract', { rc });

	// Rate contract only applies to the selected unit if it's mapped for this product.
	const unitMappings = rc.unit_product_mapping || [];
	logger.debug("unitMappings", {unitMappings})
	if (unit_id && unitMappings.length > 0) {
		const isUnitMapped = unitMappings.some(
			(mapping) =>
				Number(mapping.unit_id) === Number(unit_id) &&
				Number(mapping.product_id) === Number(product_id)
		);

		if (!isUnitMapped) return null;
	}

	// Return rate contract with the matched product's rate data merged at the top level
	// for backward compatibility with PO/WO/Budget/Indent forms
	rc.contract_rate = productRecord.contract_rate;
	rc.uom_id = productRecord.uom_id;
	rc.product_discount = productRecord.discount;
	rc.special_discount = productRecord.special_discount;
	rc.special_discount_details = productRecord.special_discount_details;
	rc.product_id = productRecord.product_id;
	rc.productSnapshot = productRecord.productSnapshot;
	logger.info("rc", {rc})
	return rc;
};
