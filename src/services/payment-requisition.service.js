const {
	sequelize,
	PaymentRequisition,
	PaymentRequisitionDeduction,
	PurchaseOrder,
	WorkOrder,
	User,
	organization,
	Role,
	CostCenter,
} = require('../models/index');
const { Op, fn, col, literal } = require('sequelize');
const paymentRequisitionRepo = require('../repository/payment-requisition.repository');
const deductionRepo = require('../repository/payment-requisition-deduction.repository');
const analyticsRepo = require('../repository/payment-requisition-analytics.repository');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { StatusCodes } = require('http-status-codes');
const { generateInvoiceHTML } = require('../pdf/htmlPdfGenerator');
const { generateSignedUrl } = require('../utils/s3Bucket');
const fs = require('fs');
const path = require('path');
const { BASE_URL } = require('../config/serverConfig');
const fetchPermissions = require('../helpers/fetchPermissions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates an array of deduction DTOs and returns the normalized rows.
 *
 * Each deduction must have: deduction_type (required), amount (required, > 0).
 * percentage is optional — if provided it is stored as-is for reference; the
 * caller is responsible for computing amount from it before passing here.
 */
function normalizeDeductions(deductions = [], payment_requisition_id) {
	const VALID_TYPES = ['RETENTION', 'TDS', 'SECURITY_DEPOSIT', 'ADVANCE_RECOVERY', 'LD', 'GST_TDS', 'WCT', 'OTHER'];

	return deductions.map((d, i) => {
		if (!d.deduction_type || !VALID_TYPES.includes(d.deduction_type)) {
			throw new AppError(
				`Deduction[${i}]: invalid deduction_type "${d.deduction_type}". Valid: ${VALID_TYPES.join(', ')}`,
				StatusCodes.UNPROCESSABLE_ENTITY,
			);
		}
		const amount = parseFloat(d.amount);
		if (isNaN(amount) || amount < 0) {
			throw new AppError(`Deduction[${i}]: amount must be a non-negative number`, StatusCodes.UNPROCESSABLE_ENTITY);
		}
		return {
			payment_requisition_id,
			deduction_type: d.deduction_type,
			deduction_name: d.deduction_name || d.deduction_type,
			percentage: d.percentage != null ? parseFloat(d.percentage) : null,
			amount,
			remarks: d.remarks || null,
		};
	});
}

/**
 * Sums an array of deduction DTOs. Returns 0 for empty arrays.
 */
function sumDeductions(deductions = []) {
	return deductions.reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);
}

/**
 * Recalculates and persists totalPaid / remainingAmount / paymentStatus on a PO or WO.
 * Uses net_payable (actual cash out) for REGULAR requisitions.
 * RETENTION_RELEASE requisitions add back the released amount as positive cash.
 */
async function syncPoWoPaymentFields(Model, id, org_id, amountDelta, transaction) {
	const record = await Model.findOne({ where: { id, org_id }, transaction });
	if (!record) return;

	const grandTotal = parseFloat(record.grandTotal) || 0;
	const currentTotalPaid = parseFloat(record.totalPaid) || 0;
	const newTotalPaid = Math.max(0, currentTotalPaid + amountDelta);
	const newRemainingAmount = Math.max(0, grandTotal - newTotalPaid);

	let newPaymentStatus;
	if (newRemainingAmount <= 0) {
		newPaymentStatus = 'PAID';
	} else if (newTotalPaid > 0) {
		newPaymentStatus = 'PARTIAL';
	} else {
		newPaymentStatus = 'PENDING';
	}

	await Model.update(
		{ totalPaid: newTotalPaid, remainingAmount: newRemainingAmount, paymentStatus: newPaymentStatus },
		{ where: { id, org_id }, transaction },
	);

	logger.debug('Synced PO/WO payment fields', {
		model: Model.name,
		id,
		amountDelta,
		newTotalPaid,
		newRemainingAmount,
		newPaymentStatus,
	});
}

/**
 * Returns the effective "cash paid" amount for syncPoWoPaymentFields.
 * For REGULAR requisitions this is net_payable (gross minus all deductions).
 * For RETENTION_RELEASE this is gross_amount (pure positive cash back).
 */
function effectivePaidAmount(requisition) {
	if (requisition.requisition_type === 'RETENTION_RELEASE') {
		return parseFloat(requisition.gross_amount) || 0;
	}
	// Fall back to legacy total_amount for old rows that predate net_payable
	const netPayable = parseFloat(requisition.net_payable);
	if (!isNaN(netPayable) && netPayable > 0) return netPayable;
	return parseFloat(requisition.total_amount) || 0;
}

// ---------------------------------------------------------------------------
// Requisition Number
// ---------------------------------------------------------------------------

exports.getNextRequisitionNo = async (req) => {
	const { org_id } = req.user;
	const last = await paymentRequisitionRepo.findLastCreated({ org_id });
	if (!last) return 'PR-000001';
	return `PR-${String(last.id + 1).padStart(6, '0')}`;
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a PaymentRequisition with optional deduction line-items.
 *
 * Payload shape:
 * {
 *   requisitionAgainst: 'PO' | 'WO' | 'Invoice',
 *   requisitionType:    'REGULAR' | 'RETENTION_RELEASE',  // default REGULAR
 *   poWoId:            101,
 *   grossAmount:       100000,
 *   deductions: [
 *     { deduction_type: 'RETENTION', deduction_name: 'Retention @10%', percentage: 10, amount: 10000 },
 *     { deduction_type: 'TDS',       deduction_name: 'TDS @2%',        percentage: 2,  amount: 2000  },
 *   ],
 *   // ... all other existing fields
 * }
 */
exports.createPaymentRequisition = async (req, payload) => {
	const transaction = await sequelize.transaction();

	try {
		const user = req.user;

		const {
			wo_no,
			requisitionAgainst,
			requisitionType = 'REGULAR',
			poWoId,
			supplier_id,
			cost_center_id,
			supplier_snapshot,
			bankDetailsSnapshot,
			poWoDate,
			woPOAmount,
			requisitionValuePercent,
			// Accept both old (requisitionAmount) and new (grossAmount) field names
			grossAmount,
			requisitionAmount,
			deductions = [],
			// Legacy TDS fields — accepted for backward compat but superseded by deductions[]
			tdsPercent,
			tdsAmount,
			totalAmount,
			projectCode,
			projectName,
			activityId,
			budgetId,
			paymentDate,
			remark,
			termCondition,
			payment_term_id,
			paymentType,
			transactionId,
			status,
		} = payload;

		const gross = parseFloat(grossAmount ?? requisitionAmount ?? 0);
		const totalDed = sumDeductions(deductions);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('total_deductions exceeds gross_amount', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		const fedBy = { id: user.id, name: user.name, email: user.email };
		const po_id = requisitionAgainst === 'PO' && poWoId ? Number(poWoId) : null;
		const wo_id = requisitionAgainst === 'WO' && poWoId ? Number(poWoId) : null;

		// Validate retention cap — prevent cumulative over-deduction across requisitions
		const retentionDeds = deductions.filter((d) => d.deduction_type === 'RETENTION');
		if (retentionDeds.length > 0 && (po_id || wo_id)) {
			const newRetentionAmt = retentionDeds.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
			const orderId = po_id || wo_id;
			const OrderModel = po_id ? PurchaseOrder : WorkOrder;
			const order = await OrderModel.findByPk(orderId, { attributes: ['retention_amount'] });
			if (order && parseFloat(order.retention_amount) > 0) {
				const idField = po_id ? 'po_id' : 'wo_id';
				const summary = await analyticsRepo.getRetentionSummary({ idField, id: orderId, org_id: user.org_id });
				const alreadyHeld = parseFloat(summary.retention_held) || 0;
				const cap = parseFloat(order.retention_amount);
				if (alreadyHeld + newRetentionAmt > cap + 0.005) {
					throw new AppError(
						`Retention cap exceeded. Contract cap: ₹${cap.toFixed(2)}, Already held: ₹${alreadyHeld.toFixed(2)}, New deduction: ₹${newRetentionAmt.toFixed(2)}. Max allowed: ₹${Math.max(0, cap - alreadyHeld).toFixed(2)}.`,
						StatusCodes.UNPROCESSABLE_ENTITY,
					);
				}
			}
		}

		logger.info('Creating payment requisition', { org_id: user.org_id, user_id: user.id, requisitionAgainst, po_id, wo_id });

		const requisition = await paymentRequisitionRepo.create(
			{
				org_id: user.org_id,
				requisition_date: new Date(),
				requisition_against: requisitionAgainst,
				requisition_type: requisitionType,
				supplier_id: supplier_id ? Number(supplier_id) : null,
				cost_center_id,
				supplier_snapshot: supplier_snapshot ?? null,
				bank_details_snapshot: bankDetailsSnapshot ?? null,
				po_id,
				wo_id,
				wo_no,
				po_wo_date: poWoDate || null,
				wo_po_amount: woPOAmount ? Number(woPOAmount) : 0,
				requisition_value_percent: Number(requisitionValuePercent) || 0,
				// Mirror to legacy column so existing reports/PDFs keep working
				requisition_amount: gross,
				gross_amount: gross,
				total_deductions: totalDed,
				net_payable: netPayable,
				// Legacy TDS — preserve if passed in, otherwise compute from deductions
				tds_percent: Number(tdsPercent) || 0,
				tds_amount: Number(tdsAmount) || totalDed,
				total_amount: Number(totalAmount) || netPayable,
				project_code: projectCode || null,
				project_name: projectName || null,
				activity_id: activityId || null,
				budget_id: budgetId || null,
				fed_by_id: user.id,
				fed_by: fedBy,
				payment_date: paymentDate || null,
				remark: remark || null,
				term_condition: termCondition || null,
				payment_term_id,
				payment_type: paymentType || null,
				transaction_id: transactionId || null,
				status: status || 'PENDING',
			},
			{ transaction },
		);

		// Assign requisition number using real auto-increment id
		const requisitionNo = `PR-${String(requisition.id).padStart(6, '0')}`;
		await paymentRequisitionRepo.updateById(requisition.id, { requisition_no: requisitionNo }, { transaction });

		// Persist deduction line-items
		if (deductions.length > 0) {
			const rows = normalizeDeductions(deductions, requisition.id);
			await deductionRepo.bulkCreate(rows, { transaction });
		}

		await transaction.commit();

		logger.info('Payment requisition created', { id: requisition.id, requisitionNo, org_id: user.org_id });

		return paymentRequisitionRepo.findById(requisition.id);
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to create payment requisition', { error: error.message, org_id: req.user?.org_id });
		throw error;
	}
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

exports.getAllPaymentRequisitions = async (req) => {
	const { org_id } = req.user;
	const { fromDate, toDate, status, requisitionAgainst, requisitionType, requisitionNo, limit, offset } = req.query;

	const where = { org_id };

	if (fromDate && toDate) {
		const parseDate = require('../utils/parse-date');
		const from = parseDate(fromDate);
		const to = parseDate(toDate);
		to.setDate(to.getDate() + 1);
		where.requisition_date = { [Op.gte]: from, [Op.lt]: to };
	}
	if (status && status !== 'all') where.status = status;
	if (requisitionAgainst && requisitionAgainst !== 'all') where.requisition_against = requisitionAgainst;
	if (requisitionType && requisitionType !== 'all') where.requisition_type = requisitionType;
	if (requisitionNo) where.requisition_no = { [Op.like]: `%${requisitionNo}%` };

	const data = await paymentRequisitionRepo.findAll(where, {
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
	});
	return data;
};

exports.getPaymentRequisitionById = async (req, id) => {
	const { org_id } = req.user;
	const requisition = await paymentRequisitionRepo.findById(id);
	if (!requisition || requisition.org_id !== org_id) {
		throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
	}
	return requisition;
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Replaces the deductions for a requisition atomically (delete-all + re-insert).
 * This is the simplest correct approach: the caller always sends the full desired
 * state, so a diff/patch would only add complexity without benefit.
 */
exports.updatePaymentRequisition = async (req, id, payload) => {
	const transaction = await sequelize.transaction();

	try {
		const { org_id } = req.user;
		const existing = await paymentRequisitionRepo.findById(id);

		if (!existing || existing.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const {
			requisitionAgainst,
			requisitionType,
			poWoId,
			wo_no,
			supplier_id,
			cost_center_id,
			supplier_snapshot,
			bankDetailsSnapshot,
			poWoDate,
			woPOAmount,
			requisitionValuePercent,
			grossAmount,
			requisitionAmount,
			deductions,
			tdsPercent,
			tdsAmount,
			totalAmount,
			projectCode,
			projectName,
			activityId,
			budgetId,
			paymentDate,
			remark,
			termCondition,
			payment_term_id,
			paymentType,
			transactionId,
			status,
		} = payload;

		const gross = parseFloat(grossAmount ?? requisitionAmount ?? existing.gross_amount ?? existing.requisition_amount ?? 0);
		const dedList = deductions !== undefined ? deductions : null;
		const totalDed = dedList !== null ? sumDeductions(dedList) : parseFloat(existing.total_deductions || 0);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('total_deductions exceeds gross_amount', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		const userPermissions = await fetchPermissions(req);
		const isApprover = userPermissions.includes('payment-requisition:approver');

		const authorizedByUpdate = isApprover
			? { authorized_by_id: req.user.id, authorized_by: { id: req.user.id, name: req.user.name, email: req.user.email } }
			: { authorized_by_id: existing.authorized_by_id, authorized_by: existing.authorized_by };

		const approverOnlyFields = isApprover
			? { status: status || existing.status, payment_type: paymentType || null, transaction_id: transactionId || null, remark: remark || null }
			: { status: existing.status, payment_type: existing.payment_type, transaction_id: existing.transaction_id, remark: existing.remark };

		const po_id = (requisitionAgainst || existing.requisition_against) === 'PO' && (poWoId ?? existing.po_id)
			? Number(poWoId ?? existing.po_id)
			: null;
		const wo_id = (requisitionAgainst || existing.requisition_against) === 'WO' && (poWoId ?? existing.wo_id)
			? Number(poWoId ?? existing.wo_id)
			: null;

		await paymentRequisitionRepo.updateById(
			id,
			{
				requisition_against: requisitionAgainst || existing.requisition_against,
				requisition_type: requisitionType || existing.requisition_type,
				supplier_id: supplier_id ? Number(supplier_id) : null,
				cost_center_id: cost_center_id || existing.cost_center_id || null,
				supplier_snapshot: supplier_snapshot ?? null,
				bank_details_snapshot: bankDetailsSnapshot ?? null,
				po_id,
				wo_id,
				wo_no,
				po_wo_date: poWoDate || null,
				wo_po_amount: woPOAmount ? Number(woPOAmount) : 0,
				requisition_value_percent: Number(requisitionValuePercent) || 0,
				requisition_amount: gross,
				gross_amount: gross,
				total_deductions: totalDed,
				net_payable: netPayable,
				tds_percent: Number(tdsPercent) || 0,
				tds_amount: Number(tdsAmount) || totalDed,
				total_amount: Number(totalAmount) || netPayable,
				project_code: projectCode || null,
				project_name: projectName || null,
				activity_id: activityId || null,
				budget_id: budgetId || null,
				...authorizedByUpdate,
				payment_date: paymentDate || null,
				term_condition: termCondition || null,
				payment_term_id,
				...approverOnlyFields,
			},
			{ transaction },
		);

		// Replace deductions only when the caller explicitly sends the array
		if (dedList !== null) {
			await deductionRepo.deleteByRequisitionId(id, { transaction });
			if (dedList.length > 0) {
				const rows = normalizeDeductions(dedList, Number(id));
				await deductionRepo.bulkCreate(rows, { transaction });
			}
		}

		// Sync totalPaid on parent PO/WO when approval status changes
		const oldStatus = existing.status;
		const newStatus = approverOnlyFields.status;
		const parentId = po_id || wo_id || existing.po_id || existing.wo_id;
		const ParentModel = (requisitionAgainst || existing.requisition_against) === 'PO' ? PurchaseOrder : WorkOrder;

		if (parentId) {
			let amountDelta = 0;
			if (oldStatus === 'APPROVED') amountDelta -= effectivePaidAmount(existing);
			if (newStatus === 'APPROVED') amountDelta += netPayable;
			if (amountDelta !== 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, amountDelta, transaction);
			}
		}

		await transaction.commit();

		logger.info('Payment requisition updated', { id, org_id });
		return paymentRequisitionRepo.findById(id);
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to update payment requisition', { id, error: error.message });
		throw error;
	}
};

// ---------------------------------------------------------------------------
// Deduction CRUD (individual endpoints)
// ---------------------------------------------------------------------------

exports.addDeduction = async (req, requisitionId, deductionPayload) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
		const requisition = await paymentRequisitionRepo.findById(requisitionId);

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const [row] = normalizeDeductions([deductionPayload], Number(requisitionId));
		const deduction = await deductionRepo.bulkCreate([row], { transaction });

		// Recalculate totals
		const existingDeductions = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = existingDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('Adding this deduction would make net_payable negative', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable },
			{ transaction },
		);

		await transaction.commit();
		return deduction[0];
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};

exports.updateDeduction = async (req, requisitionId, deductionId, deductionPayload) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
		const requisition = await paymentRequisitionRepo.findById(requisitionId);

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const deduction = await deductionRepo.findById(deductionId);
		if (!deduction || deduction.payment_requisition_id !== Number(requisitionId)) {
			throw new AppError('Deduction not found', StatusCodes.NOT_FOUND);
		}

		const [normalized] = normalizeDeductions([deductionPayload], Number(requisitionId));
		await deductionRepo.updateById(deductionId, normalized, { transaction });

		const allDeductions = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = allDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('Updated deduction makes net_payable negative', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable },
			{ transaction },
		);

		await transaction.commit();
		return deductionRepo.findById(deductionId);
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};

exports.deleteDeduction = async (req, requisitionId, deductionId) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
		const requisition = await paymentRequisitionRepo.findById(requisitionId);

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const deduction = await deductionRepo.findById(deductionId);
		if (!deduction || deduction.payment_requisition_id !== Number(requisitionId)) {
			throw new AppError('Deduction not found', StatusCodes.NOT_FOUND);
		}

		await deductionRepo.deleteById(deductionId, { transaction });

		const remaining = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = remaining.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);
		const netPayable = gross - totalDed;

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable },
			{ transaction },
		);

		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};

// ---------------------------------------------------------------------------
// Delete requisition
// ---------------------------------------------------------------------------

exports.deletePaymentRequisition = async (req, id) => {
	const { org_id } = req.user;
	const existing = await paymentRequisitionRepo.findById(id);

	if (!existing || existing.org_id !== org_id) {
		throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
	}

	const transaction = await sequelize.transaction();
	try {
		// Child deductions are deleted via CASCADE on the FK, but we delete explicitly
		// so the audit log is clear about what happened.
		await deductionRepo.deleteByRequisitionId(id, { transaction });
		await paymentRequisitionRepo.deleteById(id, { transaction });

		if (existing.status === 'APPROVED') {
			const parentId = existing.po_id || existing.wo_id;
			const ParentModel = existing.requisition_against === 'PO' ? PurchaseOrder : WorkOrder;
			const amount = effectivePaidAmount(existing);
			if (parentId && amount > 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, -amount, transaction);
			}
		}

		await transaction.commit();
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

// ---------------------------------------------------------------------------
// PO / WO Summary
// ---------------------------------------------------------------------------

exports.getPoWoSummary = async (req, type, id) => {
	const { org_id } = req.user;

	const idField = type === 'PO' ? 'po_id' : 'wo_id';
	const Model = type === 'PO' ? PurchaseOrder : WorkOrder;

	const record = await Model.findOne({ where: { id, org_id }, attributes: ['total_taxable', 'grandTotal'] });
	if (!record) throw new AppError(`${type} not found`, StatusCodes.NOT_FOUND);

	const basicAmount = parseFloat(record.total_taxable) || 0;
	const totalAmount = parseFloat(record.grandTotal) || 0;

	const [financial, retentionSummary, deductionBreakdown] = await Promise.all([
		analyticsRepo.getPoWoFinancialSummary({ idField, id, org_id }),
		analyticsRepo.getRetentionSummary({ idField, id, org_id }),
		analyticsRepo.getDeductionBreakdownByPoWo({ idField, id, org_id }),
	]);

	const totalGross = parseFloat(financial?.total_gross || 0);
	const totalNetPaid = parseFloat(financial?.total_net_paid || 0);
	const totalRetentionReleased = parseFloat(financial?.total_retention_released || 0);
	const totalDeductions = parseFloat(financial?.total_deductions || 0);
	const remainingAmount = Math.max(0, totalAmount - totalGross);

	return {
		poWoBasicAmount: basicAmount,
		poWoExpInvAmount: totalAmount,
		totalGross,
		totalDeductions,
		totalNetPaid,
		remainingAmount,
		totalReqCount: parseInt(financial?.non_rejected_count || 0),
		pendingCount: parseInt(financial?.pending_count || 0),
		retention: {
			held: retentionSummary.retention_held,
			released: retentionSummary.retention_released,
			balance: retentionSummary.retention_balance,
		},
		deductionBreakdown,
	};
};

exports.getDeductionAnalytics = async (req, type, id) => {
	const { org_id } = req.user;
	const idField = type === 'PO' ? 'po_id' : 'wo_id';
	return analyticsRepo.getFullLedgerByPoWo({ idField, id, org_id });
};

// ---------------------------------------------------------------------------
// Retention Release
// ---------------------------------------------------------------------------

/**
 * Creates a RETENTION_RELEASE requisition.
 *
 * This does NOT modify previous deduction rows — it creates a new requisition
 * of type RETENTION_RELEASE with a positive gross_amount equal to the release amount.
 * No deductions are applied. The analytics layer handles netting automatically.
 *
 * Payload: { po_id | wo_id, release_amount, remark, payment_date, ... }
 */
exports.createRetentionRelease = async (req, payload) => {
	const {
		requisitionAgainst,
		poWoId,
		wo_no,
		releaseAmount,
		remark,
		paymentDate,
		payment_term_id,
		paymentType,
		transactionId,
		supplier_id,
		supplier_snapshot,
		bankDetailsSnapshot,
		cost_center_id,
		poWoDate,
		activityId,
		budgetId,
	} = payload;

	if (!releaseAmount || parseFloat(releaseAmount) <= 0) {
		throw new AppError('releaseAmount must be a positive number', StatusCodes.UNPROCESSABLE_ENTITY);
	}

	// Validate that we are not releasing more than what is held
	const { org_id } = req.user;
	const idField = requisitionAgainst === 'PO' ? 'po_id' : 'wo_id';
	const retentionSummary = await analyticsRepo.getRetentionSummary({ idField, id: poWoId, org_id });

	const requested = parseFloat(releaseAmount);
	if (requested > retentionSummary.retention_balance) {
		throw new AppError(
			`Cannot release ₹${requested.toFixed(2)}. Retention balance is only ₹${retentionSummary.retention_balance.toFixed(2)}`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}

	return exports.createPaymentRequisition(req, {
		requisitionAgainst,
		requisitionType: 'RETENTION_RELEASE',
		poWoId,
		wo_no,
		grossAmount: requested,
		deductions: [],
		remark: remark || `Retention release of ₹${requested.toFixed(2)}`,
		paymentDate,
		payment_term_id,
		paymentType,
		transactionId,
		supplier_id,
		supplier_snapshot,
		bankDetailsSnapshot,
		cost_center_id,
		poWoDate,
		activityId,
		budgetId,
		status: 'PENDING',
	});
};

// ---------------------------------------------------------------------------
// PDF / HTML
// ---------------------------------------------------------------------------

async function buildRequisitionTemplateData(requisition) {
	const data = requisition.get ? requisition.get({ plain: true }) : requisition;

	const orgRole = await Role.findOne({ where: { code: 'org_admin' }, attributes: ['id'] });
	const userData = await User.findOne({
		where: { org_id: data.org_id },
		include: [{ model: organization, as: 'organization' }],
		...(orgRole ? { where: { org_id: data.org_id } } : {}),
	});

	let businessLogo = null;
	let business = null;
	if (userData) {
		business = userData.organization?.get ? userData.organization.get({ plain: true }) : userData.organization;
		if (business) {
			business.address = `${business.org_address || ''}, ${business.city || ''} - ${business.pincode || ''}`;
		}
		if (userData.logo) businessLogo = await generateSignedUrl(userData.logo);
	}

	let cost_center_name = null;
	if (data.cost_center_id) {
		const cc = await CostCenter.findByPk(data.cost_center_id, { attributes: ['name'] });
		cost_center_name = cc?.name ?? null;
	}

	return { ...data, businessLogo, business, cost_center_name };
}

exports.generateRequisitionHtml = async (req) => {
	const { id } = req.params;
	const { org_id } = req.user;
	const requisition = await paymentRequisitionRepo.findById(id);
	if (!requisition || requisition.org_id !== org_id) {
		throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
	}
	const templateData = await buildRequisitionTemplateData(requisition);
	const html = await generateInvoiceHTML(templateData, 'paymentRequisitionTemplate');
	return `<div class="preview-page">${html}</div>`;
};

exports.downloadRequisitionPdf = async (req) => {
	const { html = '' } = req.body;
	const now = new Date();
	const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
	const pdfName = `payment_requisition_${formatted}.pdf`;
	const pdfDir = path.join(__dirname, '../../storage/payment-requisitions');
	fs.mkdirSync(pdfDir, { recursive: true });
	const pdfPath = path.join(pdfDir, pdfName);
	const puppeteer = require('puppeteer');
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.setContent(html, { waitUntil: 'networkidle0' });
	await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
	await browser.close();
	const baseUrl = BASE_URL || 'http://localhost:5000';
	return `${baseUrl}/storage/payment-requisitions/${pdfName}`;
};
