const {
	sequelize,
	PaymentRequisition,
	PaymentRequisitionDeduction,
	PurchaseOrder,
	WorkOrder,
	PurchaseInvoice,
	User,
	organization,
	Role,
	CostCenter,
	TdsLiability,
} = require('../models/index');
const { Op, fn, col, literal } = require('sequelize');
const paymentRequisitionRepo = require('../repository/payment-requisition.repository');
const deductionRepo = require('../repository/payment-requisition-deduction.repository');
const analyticsRepo = require('../repository/payment-requisition-analytics.repository');
const tdsLiabilityRepo = require('../repository/tds-liability.repository');
const tdsLiabilityService = require('./tds-liability.service');
const auditLogService = require('./auditLog.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { StatusCodes } = require('http-status-codes');
const { generateInvoiceHTML } = require('../pdf/htmlPdfGenerator');
const { generateSignedUrl } = require('../utils/s3Bucket');
const fs = require('fs');
const path = require('path');
const { BASE_URL } = require('../config/serverConfig');
const fetchPermissions = require('../helpers/fetchPermissions');
const money = require('../utils/money');
const { getTaxableRatio } = require('../utils/taxable-ratio.util');
const { getPoReceivedValue } = require('./grn.service');

const TDS_DEDUCTION_TYPES = ['TDS', 'GST_TDS', 'WCT'];

// Deduction types whose amount, when driven by a percentage, must be computed
// on the taxable (pre-GST) slice of gross rather than gross itself — TDS
// under the Income Tax Act (CBDT Circular 23/2017) and GST-TDS under Section
// 51 CGST Act are both legally deducted on the value excluding GST when GST
// is shown separately. WCT is deliberately excluded: it's a pre-GST,
// state-varying concept without a standardized taxable-value convention, so
// it keeps the old gross-based behavior.
const TAXABLE_BASE_DEDUCTION_TYPES = ['TDS', 'GST_TDS'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates an array of deduction DTOs and returns the normalized rows
 * (still missing payment_requisition_id — callers attach that once the
 * requisition's id is known, see call sites).
 *
 * Each deduction must have: deduction_type (required), amount (required, > 0)
 * unless it's a percentage-driven TDS/GST_TDS line, in which case amount is
 * recomputed server-side from `gross * taxableRatio * percentage / 100` and
 * whatever the client sent is discarded — the client is not trusted to get
 * the taxable-base math right (or to not tamper with it). Other deduction
 * types (RETENTION, WCT, etc.) still trust the client-provided amount even
 * when a percentage is present, since those aren't tax computations with a
 * single legally-mandated base.
 */
function normalizeDeductions(deductions = [], { gross, taxableRatio = 1 } = {}) {
	const VALID_TYPES = ['RETENTION', 'TDS', 'SECURITY_DEPOSIT', 'ADVANCE_RECOVERY', 'LD', 'GST_TDS', 'WCT', 'OTHER'];

	return deductions.map((d, i) => {
		if (!d.deduction_type || !VALID_TYPES.includes(d.deduction_type)) {
			throw new AppError(
				`Deduction[${i}]: invalid deduction_type "${d.deduction_type}". Valid: ${VALID_TYPES.join(', ')}`,
				StatusCodes.UNPROCESSABLE_ENTITY,
			);
		}

		const percentage = d.percentage != null ? parseFloat(d.percentage) : null;
		const isTaxableBaseType = TAXABLE_BASE_DEDUCTION_TYPES.includes(d.deduction_type);

		let amount;
		if (isTaxableBaseType && percentage != null && percentage > 0 && gross != null) {
			const taxableBase = money.round2(gross * taxableRatio);
			amount = money.round2(taxableBase * (percentage / 100));
		} else {
			amount = parseFloat(d.amount);
		}

		if (isNaN(amount) || amount < 0) {
			throw new AppError(`Deduction[${i}]: amount must be a non-negative number`, StatusCodes.UNPROCESSABLE_ENTITY);
		}

		return {
			deduction_type: d.deduction_type,
			deduction_name: d.deduction_name || d.deduction_type,
			percentage,
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
 *
 * For a PurchaseOrder, remainingAmount is capped at what's actually been
 * received (Σ MRN received_qty × price), not the PO's full grandTotal — so a
 * partially-received or short-closed PO reads as PAID once it's paid for what
 * arrived, not once it's paid for what was originally ordered. WO has no
 * MRN-equivalent receipt ledger yet, so it keeps the uncapped grandTotal
 * ceiling unchanged.
 */
async function syncPoWoPaymentFields(Model, id, org_id, amountDelta, transaction) {
	const record = await Model.findOne({ where: { id, org_id }, transaction, lock: transaction.LOCK.UPDATE });
	if (!record) return;

	const grandTotal = parseFloat(record.grandTotal) || 0;
	let ceiling = grandTotal;
	if (Model === PurchaseOrder) {
		const receivedValue = await getPoReceivedValue(id, { transaction });
		ceiling = Math.min(grandTotal, receivedValue);
	}
	const currentTotalPaid = parseFloat(record.totalPaid) || 0;
	const newTotalPaid = Math.max(0, currentTotalPaid + amountDelta);
	const newRemainingAmount = Math.max(0, ceiling - newTotalPaid);

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
 * Returns the amount that should move PO/WO.totalPaid for a REGULAR
 * requisition, or null if this requisition type shouldn't touch PO/WO totals
 * at all.
 *
 * This is deliberately gross_amount, not net_payable. totalPaid/remainingAmount
 * answer "how much of this PO/WO's value has been requisitioned" — that's a
 * procurement/budget question, not a treasury one. gross_amount already
 * accounts for the full requisitioned value regardless of how it later splits
 * between vendor cash, TDS liability, and retention hold, so once 100% of
 * gross has been requisitioned the PO/WO correctly reads as fully processed.
 * Using net_payable instead (the actual cash sent to the vendor) leaves a
 * permanent phantom "outstanding" balance equal to the cumulative TDS —
 * remainingAmount can never reach zero on any order that has TDS deducted.
 *
 * RETENTION_RELEASE requisitions return null: the retention they release was
 * already counted in gross_amount the first time it was withheld, so adding
 * the release amount again here would double-count it against grandTotal.
 * That cash event is tracked separately via the retention held/released/
 * balance summary (payment-requisition-analytics.repository.js), not via
 * PO/WO.totalPaid.
 */
function poWoSyncAmount(requisition) {
	if (requisition.requisition_type === 'RETENTION_RELEASE') return null;
	const gross = parseFloat(requisition.gross_amount);
	if (!isNaN(gross)) return gross;
	// Fall back to legacy requisition_amount for old rows that predate gross_amount
	return parseFloat(requisition.requisition_amount) || 0;
}

/**
 * Resolves what syncPoWoPaymentFields should update for a requisition — an
 * Invoice-anchored requisition still syncs its underlying PO's or WO's
 * totalPaid/remainingAmount (via the invoice's own document_type +
 * purchase_order_id/work_order_id), not a parallel per-invoice ledger;
 * purchase_invoice_id exists on the requisition purely for traceability/
 * display.
 */
async function resolveSyncTarget({ po_id, wo_id, purchase_invoice_id }, transaction) {
	if (po_id) return { parentId: po_id, ParentModel: PurchaseOrder };
	if (wo_id) return { parentId: wo_id, ParentModel: WorkOrder };
	if (purchase_invoice_id) {
		const invoice = await PurchaseInvoice.findByPk(purchase_invoice_id, {
			attributes: ['document_type', 'purchase_order_id', 'work_order_id'],
			transaction,
		});
		if (invoice) {
			return invoice.document_type === 'work_order'
				? { parentId: invoice.work_order_id, ParentModel: WorkOrder }
				: { parentId: invoice.purchase_order_id, ParentModel: PurchaseOrder };
		}
	}
	return { parentId: null, ParentModel: null };
}

/**
 * Resolves the PO/WO id retention checks should key off, for anything
 * exposing po_id/wo_id/purchase_invoice_id (a requisition row, or the
 * derived ids inside createPaymentRequisition). An Invoice-anchored
 * requisition still draws against its underlying PO's or WO's shared
 * retention ledger via the invoice's own document_type +
 * purchase_order_id/work_order_id — retention is never a parallel
 * per-invoice concept. Returns { orderId, isPo } — isPo selects which
 * cross-path retention summary validateRetentionCap should use.
 */
async function resolveRetentionOrderId({ po_id, wo_id, purchase_invoice_id }, transaction) {
	if (po_id) return { orderId: po_id, isPo: true };
	if (wo_id) return { orderId: wo_id, isPo: false };
	if (!purchase_invoice_id) return { orderId: null, isPo: false };
	const invoice = await PurchaseInvoice.findByPk(purchase_invoice_id, {
		attributes: ['document_type', 'purchase_order_id', 'work_order_id'],
		transaction,
	});
	if (!invoice) return { orderId: null, isPo: false };
	return invoice.document_type === 'work_order'
		? { orderId: invoice.work_order_id, isPo: false }
		: { orderId: invoice.purchase_order_id, isPo: true };
}

/**
 * Validates retention-related caps against a locked PO/WO row and returns
 * nothing (throws AppError on violation). Shared by createPaymentRequisition
 * (both REGULAR-with-retention and RETENTION_RELEASE), addDeduction, and
 * updatePaymentRequisition, so every entry point that can add a RETENTION
 * deduction or release retention enforces the same cap under the same row
 * lock — closes the gap where addDeduction used to bypass the cap entirely.
 *
 * `isPo` selects the summary query: both a PO's and a WO's held/released
 * figures are computed across BOTH the direct and Invoice-anchored payment
 * paths (getRetentionSummaryForPo / getRetentionSummaryForWo) since Purchase
 * Invoice can now be anchored on either — see purchase-invoice.service.js.
 *
 * Must be called with a transaction that has already taken
 * `lock: transaction.LOCK.UPDATE` on the PO/WO row (via the caller loading
 * `order`), so concurrent requisitions against the same PO/WO serialize here.
 */
async function validateRetentionCap({ requisitionType, order, isPo, orderId, org_id, newRetentionAmt, transaction }) {
	const cap = parseFloat(order?.retention_amount) || 0;
	if (cap <= 0 && requisitionType !== 'RETENTION_RELEASE') return;

	const summary = isPo
		? await analyticsRepo.getRetentionSummaryForPo({ poId: orderId, org_id, transaction })
		: await analyticsRepo.getRetentionSummaryForWo({ woId: orderId, org_id, transaction });
	const alreadyHeld = parseFloat(summary.retention_held) || 0;
	const alreadyReleased = parseFloat(summary.retention_released) || 0;
	const balance = Math.max(0, alreadyHeld - alreadyReleased);

	if (requisitionType === 'RETENTION_RELEASE') {
		if (money.gt(newRetentionAmt, balance)) {
			throw new AppError(
				`Cannot release ₹${newRetentionAmt.toFixed(2)}. Retention balance is only ₹${balance.toFixed(2)}.`,
				StatusCodes.UNPROCESSABLE_ENTITY,
			);
		}
		return;
	}

	if (newRetentionAmt > 0 && money.gt(money.sum([alreadyHeld, newRetentionAmt]), cap)) {
		throw new AppError(
			`Retention cap exceeded. Contract cap: ₹${cap.toFixed(2)}, Already held: ₹${alreadyHeld.toFixed(2)}, New deduction: ₹${newRetentionAmt.toFixed(2)}. Max allowed: ₹${Math.max(0, cap - alreadyHeld).toFixed(2)}.`,
			StatusCodes.UNPROCESSABLE_ENTITY,
		);
	}
}

/**
 * Blocks deduction mutation (bulk replace / per-line update / delete) once any
 * non-cancelled TdsLiability has been generated for this requisition — those
 * deduction rows are now the source of a real financial liability record, and
 * editing/deleting them out from under it would silently desync the two.
 * (addDeduction is exempt: adding a brand-new line never touches an existing
 * liability-backed row.)
 */
async function assertDeductionsMutable(requisitionId, transaction) {
	const count = await TdsLiability.count({
		where: { payment_requisition_id: requisitionId, status: { [Op.ne]: 'CANCELLED' } },
		transaction,
	});
	if (count > 0) {
		throw new AppError(
			'This requisition has TDS liabilities on record and its existing deductions can no longer be edited or removed directly. Add a new deduction line instead, or reverse the relevant TDS settlement first.',
			StatusCodes.CONFLICT,
		);
	}
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
		const fedBy = { id: user.id, name: user.name, email: user.email };
		const po_id = requisitionAgainst === 'PO' && poWoId ? Number(poWoId) : null;
		const wo_id = requisitionAgainst === 'WO' && poWoId ? Number(poWoId) : null;
		const purchase_invoice_id = requisitionAgainst === 'Invoice' && poWoId ? Number(poWoId) : null;

		let invoice = null;
		if (purchase_invoice_id) {
			invoice = await PurchaseInvoice.findOne({ where: { id: purchase_invoice_id, org_id: user.org_id } });
			if (!invoice) {
				throw new AppError('Purchase Invoice not found', StatusCodes.NOT_FOUND);
			}
			if (invoice.status !== 'approved') {
				throw new AppError(
					`Cannot requisition against a Purchase Invoice that is "${invoice.status}", not approved`,
					StatusCodes.CONFLICT,
				);
			}
			// One Purchase Invoice <-> at most one non-rejected Payment Requisition —
			// no partial multi-PR drawdown against a single invoice.
			const existingPrCount = await PaymentRequisition.count({
				where: { purchase_invoice_id, status: { [Op.ne]: 'REJECTED' } },
			});
			if (existingPrCount > 0) {
				throw new AppError('A Payment Requisition already exists for this Purchase Invoice', StatusCodes.CONFLICT);
			}
			if (gross > parseFloat(invoice.grandTotal || 0) + 0.001) {
				throw new AppError(
					`Requisition amount exceeds this invoice's value of ₹${parseFloat(invoice.grandTotal || 0).toFixed(2)}`,
					StatusCodes.UNPROCESSABLE_ENTITY,
				);
			}
		}

		// PO/WO-direct closes once any active (non-rejected/cancelled) Purchase
		// Invoice exists for it — from then on, PR must go through the invoice
		// instead of the PO/WO directly.
		if (po_id) {
			const activeInvoiceCount = await PurchaseInvoice.count({
				where: { document_type: 'purchase_order', purchase_order_id: po_id, status: { [Op.notIn]: ['rejected', 'cancelled'] } },
			});
			if (activeInvoiceCount > 0) {
				throw new AppError(
					'This PO has a Purchase Invoice raised against it — raise the requisition against the Invoice instead of the PO directly.',
					StatusCodes.CONFLICT,
				);
			}
		}
		if (wo_id) {
			const activeInvoiceCount = await PurchaseInvoice.count({
				where: { document_type: 'work_order', work_order_id: wo_id, status: { [Op.notIn]: ['rejected', 'cancelled'] } },
			});
			if (activeInvoiceCount > 0) {
				throw new AppError(
					'This WO has a Purchase Invoice raised against it — raise the requisition against the Invoice instead of the WO directly.',
					StatusCodes.CONFLICT,
				);
			}
		}

		// Deduction amounts are normalized (and TDS/GST_TDS recomputed against the
		// taxable base) before totalDed/netPayable are derived from them, so the
		// requisition's own stored totals always agree with what actually gets
		// inserted into PaymentRequisitionDeductions.
		let taxableRatio = 1;
		if ((po_id || wo_id || purchase_invoice_id) && deductions.some((d) => TAXABLE_BASE_DEDUCTION_TYPES.includes(d.deduction_type))) {
			taxableRatio = await getTaxableRatio({ PurchaseOrder, WorkOrder, PurchaseInvoice, po_id, wo_id, purchase_invoice_id, transaction });
		}
		const normalizedDeductions = normalizeDeductions(deductions, { gross, taxableRatio });
		const totalDed = sumDeductions(normalizedDeductions);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('total_deductions exceeds gross_amount', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		// Validate retention cap / release balance under a row lock — prevents cumulative
		// over-deduction or over-release across concurrent requisitions on the same PO/WO.
		// An Invoice-anchored requisition resolves to its underlying PO's or WO's
		// shared retention ledger (see resolveRetentionOrderId) rather than a
		// parallel one.
		const retentionDeds = normalizedDeductions.filter((d) => d.deduction_type === 'RETENTION');
		const newRetentionAmt = money.sum(retentionDeds.map((d) => d.amount));
		const { orderId: retentionOrderId, isPo: retentionIsPo } = await resolveRetentionOrderId(
			{ po_id, wo_id, purchase_invoice_id },
			transaction,
		);
		if ((requisitionType === 'RETENTION_RELEASE' || newRetentionAmt > 0) && retentionOrderId) {
			const OrderModel = retentionIsPo ? PurchaseOrder : WorkOrder;
			const order = await OrderModel.findByPk(retentionOrderId, {
				attributes: ['retention_amount'],
				transaction,
				lock: transaction.LOCK.UPDATE,
			});
			if (order) {
				await validateRetentionCap({
					requisitionType,
					order,
					isPo: retentionIsPo,
					orderId: retentionOrderId,
					org_id: user.org_id,
					newRetentionAmt: requisitionType === 'RETENTION_RELEASE' ? gross : newRetentionAmt,
					transaction,
				});
			}
		}

		// Cap PO-direct requisitions at what's actually been received — a PO
		// can't be requisitioned for value that was short-closed or never
		// arrived. WO has no MRN-equivalent receipt ledger yet, so this only
		// applies to PO; WO-direct requisitions keep today's behavior.
		if (po_id) {
			const poForCap = await PurchaseOrder.findByPk(po_id, {
				attributes: ['grandTotal'],
				transaction,
				lock: transaction.LOCK.UPDATE,
			});
			if (poForCap) {
				const grandTotal = parseFloat(poForCap.grandTotal) || 0;
				const receivedValue = await getPoReceivedValue(po_id, { transaction });
				const ceiling = Math.min(grandTotal, receivedValue);
				const financial = await analyticsRepo.getPoWoFinancialSummary({
					idField: 'po_id',
					id: po_id,
					org_id: user.org_id,
				});
				const totalGrossSoFar = parseFloat(financial?.total_gross || 0);
				const remaining = Math.max(0, ceiling - totalGrossSoFar);
				if (gross > remaining) {
					throw new AppError(
						`Requisition amount exceeds what's payable for this PO — only ₹${remaining.toFixed(2)} remains against received value (received ₹${receivedValue.toFixed(2)} of ordered ₹${grandTotal.toFixed(2)}).`,
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
				cost_center_id: cost_center_id ? Number(cost_center_id) : null,
				supplier_snapshot: supplier_snapshot ?? null,
				bank_details_snapshot: bankDetailsSnapshot ?? null,
				po_id,
				wo_id,
				purchase_invoice_id,
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
				created_by_id: user.id,
				updated_by_id: user.id,
				payment_date: paymentDate || null,
				remark: remark || null,
				term_condition: termCondition || null,
				payment_term_id: payment_term_id ? Number(payment_term_id) : null,
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
		if (normalizedDeductions.length > 0) {
			const rows = normalizedDeductions.map((d) => ({ ...d, payment_requisition_id: requisition.id }));
			await deductionRepo.bulkCreate(rows, { transaction });
		}

		// A requisition can in principle be created pre-approved (status passed
		// directly) rather than approved later via updatePaymentRequisition — keep
		// the PO/WO sync and TDS liability creation consistent regardless of which
		// path took it there.
		const finalStatus = status || 'PENDING';
		if (finalStatus === 'APPROVED') {
			const { parentId, ParentModel } = await resolveSyncTarget({ po_id, wo_id, purchase_invoice_id }, transaction);
			const paidAmount = poWoSyncAmount({ requisition_type: requisitionType, gross_amount: gross });
			if (parentId && paidAmount !== null) {
				await syncPoWoPaymentFields(ParentModel, parentId, user.org_id, paidAmount, transaction);
			}
			const freshRequisition = await paymentRequisitionRepo.findById(requisition.id, { transaction });
			await tdsLiabilityService.createLiabilitiesForApprovedRequisition(req, freshRequisition, transaction);
		}

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: requisition.id,
			action: 'create',
			newState: { requisition_no: requisitionNo, gross_amount: gross, total_deductions: totalDed, net_payable: netPayable, status: finalStatus },
			transaction,
		});

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

		// Lock the requisition row itself first so two concurrent updates (e.g. a
		// double-click approve, or two approvers racing) on the same PR serialize
		// instead of both reading the same "not yet approved" oldStatus and both
		// applying their PO/WO sync / TDS liability creation.
		const lockedRow = await PaymentRequisition.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
		if (!lockedRow || lockedRow.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}
		const existing = await paymentRequisitionRepo.findById(id, { transaction });

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
		const rawDedList = deductions !== undefined ? deductions : null;
		const finalRequisitionType = requisitionType || existing.requisition_type;

		// Deduction rows already backing a TDS liability are frozen — bulk-replacing
		// them here would either silently desync the liability or hit the DB's
		// RESTRICT FK; fail with a clear message instead.
		if (rawDedList !== null) {
			await assertDeductionsMutable(id, transaction);
		}

		const po_id = (requisitionAgainst || existing.requisition_against) === 'PO' && (poWoId ?? existing.po_id)
			? Number(poWoId ?? existing.po_id)
			: null;
		const wo_id = (requisitionAgainst || existing.requisition_against) === 'WO' && (poWoId ?? existing.wo_id)
			? Number(poWoId ?? existing.wo_id)
			: null;
		const purchase_invoice_id =
			(requisitionAgainst || existing.requisition_against) === 'Invoice' && (poWoId ?? existing.purchase_invoice_id)
				? Number(poWoId ?? existing.purchase_invoice_id)
				: null;

		// Same normalize-before-totaling flow as createPaymentRequisition — see its
		// comment for why (keeps the requisition's own stored totals in agreement
		// with what's actually inserted into PaymentRequisitionDeductions).
		let dedList = null;
		if (rawDedList !== null) {
			let taxableRatio = 1;
			if ((po_id || wo_id || purchase_invoice_id) && rawDedList.some((d) => TAXABLE_BASE_DEDUCTION_TYPES.includes(d.deduction_type))) {
				taxableRatio = await getTaxableRatio({ PurchaseOrder, WorkOrder, PurchaseInvoice, po_id, wo_id, purchase_invoice_id, transaction });
			}
			dedList = normalizeDeductions(rawDedList, { gross, taxableRatio });
		}
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

		// authorized_at records the moment status genuinely transitions to APPROVED/REJECTED,
		// unlike authorized_by(_id) which is refreshed on every approver edit.
		const isStatusTransition =
			isApprover &&
			approverOnlyFields.status !== existing.status &&
			['APPROVED', 'REJECTED'].includes(approverOnlyFields.status);
		const authorizedAtUpdate = {
			authorized_at: isStatusTransition ? new Date() : existing.authorized_at,
		};

		const oldStatus = existing.status;
		const newStatus = approverOnlyFields.status;

		// Re-validate the receipt-value cap if this PO-direct requisition's gross
		// amount is changing and it isn't rejected — same "subtract this
		// requisition's own prior contribution before comparing" pattern as the
		// retention check below, so editing gross_amount can't silently bypass
		// the cap createPaymentRequisition already enforces at creation time.
		if (po_id && newStatus !== 'REJECTED' && gross !== parseFloat(existing.gross_amount || 0)) {
			const poForCap = await PurchaseOrder.findByPk(po_id, {
				attributes: ['grandTotal'],
				transaction,
				lock: transaction.LOCK.UPDATE,
			});
			if (poForCap) {
				const grandTotal = parseFloat(poForCap.grandTotal) || 0;
				const receivedValue = await getPoReceivedValue(po_id, { transaction });
				const ceiling = Math.min(grandTotal, receivedValue);
				const financial = await analyticsRepo.getPoWoFinancialSummary({ idField: 'po_id', id: po_id, org_id });
				const priorOwnGross =
					existing.requisition_type === 'REGULAR' && existing.status !== 'REJECTED'
						? parseFloat(existing.gross_amount || 0)
						: 0;
				const totalGrossExcludingSelf = Math.max(0, parseFloat(financial?.total_gross || 0) - priorOwnGross);
				const remaining = Math.max(0, ceiling - totalGrossExcludingSelf);
				if (gross > remaining) {
					throw new AppError(
						`Requisition amount exceeds what's payable for this PO — only ₹${remaining.toFixed(2)} remains against received value (received ₹${receivedValue.toFixed(2)} of ordered ₹${grandTotal.toFixed(2)}).`,
						StatusCodes.UNPROCESSABLE_ENTITY,
					);
				}
			}
		}

		// Same idea for an Invoice-anchored requisition — gross can never exceed
		// that specific invoice's own grandTotal, re-checked on any edit that
		// changes it (the 1:1 invoice<->PR and PO-direct-closes-once-invoiced
		// gates are enforced at creation only; switching which PO/Invoice a PR
		// targets after creation isn't a supported edit flow).
		if (purchase_invoice_id && newStatus !== 'REJECTED' && gross !== parseFloat(existing.gross_amount || 0)) {
			const invoiceForCap = await PurchaseInvoice.findByPk(purchase_invoice_id, { attributes: ['grandTotal'], transaction });
			if (invoiceForCap && gross > parseFloat(invoiceForCap.grandTotal || 0) + 0.001) {
				throw new AppError(
					`Requisition amount exceeds this invoice's value of ₹${parseFloat(invoiceForCap.grandTotal || 0).toFixed(2)}`,
					StatusCodes.UNPROCESSABLE_ENTITY,
				);
			}
		}

		// Re-validate the retention cap / release balance if this edit changed the
		// deduction lines and the requisition still isn't rejected. The "already
		// held" total from the DB still includes this requisition's own prior
		// RETENTION amount (its rows aren't replaced until further down), so that
		// prior amount is subtracted out before comparing against the new one —
		// otherwise editing a retention line's amount would double-count it.
		const { orderId: retentionOrderId, isPo: retentionIsPo } = await resolveRetentionOrderId(
			{ po_id, wo_id, purchase_invoice_id },
			transaction,
		);
		if (dedList !== null && retentionOrderId && newStatus !== 'REJECTED') {
			const retentionDeds = dedList.filter((d) => d.deduction_type === 'RETENTION');
			const newRetentionAmt = money.sum(retentionDeds.map((d) => d.amount));
			if (finalRequisitionType === 'RETENTION_RELEASE' || newRetentionAmt > 0) {
				const OrderModel = retentionIsPo ? PurchaseOrder : WorkOrder;
				const order = await OrderModel.findByPk(retentionOrderId, {
					attributes: ['retention_amount'],
					transaction,
					lock: transaction.LOCK.UPDATE,
				});
				if (order) {
					const cap = parseFloat(order.retention_amount) || 0;
					const summary = retentionIsPo
						? await analyticsRepo.getRetentionSummaryForPo({ poId: retentionOrderId, org_id, transaction })
						: await analyticsRepo.getRetentionSummaryForWo({ woId: retentionOrderId, org_id, transaction });
					const priorOwnRetention =
						existing.requisition_type === 'REGULAR'
							? money.sum((existing.deductions || []).filter((d) => d.deduction_type === 'RETENTION').map((d) => d.amount))
							: 0;
					const alreadyHeld = Math.max(0, money.round2((parseFloat(summary.retention_held) || 0) - priorOwnRetention));
					const alreadyReleased = parseFloat(summary.retention_released) || 0;
					const balance = Math.max(0, money.round2(alreadyHeld - alreadyReleased));

					if (finalRequisitionType === 'RETENTION_RELEASE') {
						if (money.gt(gross, balance)) {
							throw new AppError(
								`Cannot release ₹${gross.toFixed(2)}. Retention balance is only ₹${balance.toFixed(2)}.`,
								StatusCodes.UNPROCESSABLE_ENTITY,
							);
						}
					} else if (newRetentionAmt > 0 && money.gt(money.sum([alreadyHeld, newRetentionAmt]), cap)) {
						throw new AppError(
							`Retention cap exceeded. Contract cap: ₹${cap.toFixed(2)}, Already held: ₹${alreadyHeld.toFixed(2)}, New deduction: ₹${newRetentionAmt.toFixed(2)}.`,
							StatusCodes.UNPROCESSABLE_ENTITY,
						);
					}
				}
			}
		}

		// Block reversing an APPROVED requisition once any TDS liability it
		// generated has already been (partially) settled — that money has left
		// the org's account and must be unwound via settlement reversal first.
		if (oldStatus === 'APPROVED' && newStatus !== 'APPROVED' && isStatusTransition) {
			await tdsLiabilityService.cancelLiabilitiesForRequisition(
				req,
				id,
				remark || `Requisition status changed from APPROVED to ${newStatus}`,
				transaction,
			);
		}

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
				purchase_invoice_id,
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
				...authorizedAtUpdate,
				updated_by_id: req.user.id,
				payment_date: paymentDate || null,
				term_condition: termCondition || null,
				payment_term_id: payment_term_id ? Number(payment_term_id) : existing.payment_term_id || null,
				...approverOnlyFields,
			},
			{ transaction },
		);

		// Replace deductions only when the caller explicitly sends the array.
		// dedList is already normalized (see above, computed before totalDed) —
		// just attach the now-known requisition id.
		if (dedList !== null) {
			await deductionRepo.deleteByRequisitionId(id, { transaction });
			if (dedList.length > 0) {
				const rows = dedList.map((d) => ({ ...d, payment_requisition_id: Number(id) }));
				await deductionRepo.bulkCreate(rows, { transaction });
			}
		}

		// Sync totalPaid on parent PO/WO when approval status changes. RETENTION_RELEASE
		// requisitions are skipped on both sides (poWoSyncAmount returns null for them) —
		// see poWoSyncAmount's doc comment for why.
		const { parentId, ParentModel } = await resolveSyncTarget(
			{
				po_id: po_id || existing.po_id,
				wo_id: wo_id || existing.wo_id,
				purchase_invoice_id: purchase_invoice_id || existing.purchase_invoice_id,
			},
			transaction,
		);
		const oldPaidAmount = poWoSyncAmount(existing);
		const newPaidAmount = poWoSyncAmount({ requisition_type: finalRequisitionType, gross_amount: gross });

		if (parentId) {
			let amountDelta = 0;
			if (oldStatus === 'APPROVED' && oldPaidAmount !== null) amountDelta -= oldPaidAmount;
			if (newStatus === 'APPROVED' && newPaidAmount !== null) amountDelta += newPaidAmount;
			if (amountDelta !== 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, amountDelta, transaction);
			}
		}

		// Generate TDS liabilities the moment this requisition first becomes
		// APPROVED (idempotent — safe even if called again on a no-op re-save).
		if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
			const freshRequisition = await paymentRequisitionRepo.findById(id, { transaction });
			await tdsLiabilityService.createLiabilitiesForApprovedRequisition(req, freshRequisition, transaction);
		}

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: id,
			action: 'update',
			previousState: { status: oldStatus, gross_amount: existing.gross_amount, net_payable: existing.net_payable },
			newState: { status: newStatus, gross_amount: gross, net_payable: netPayable },
			transaction,
		});

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
		const requisition = await paymentRequisitionRepo.findById(requisitionId, { transaction });

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const { orderId, isPo: retentionIsPo } = await resolveRetentionOrderId(
			{ po_id: requisition.po_id, wo_id: requisition.wo_id, purchase_invoice_id: requisition.purchase_invoice_id },
			transaction,
		);
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);

		// Adding a RETENTION line here must pass the same cap check as the create
		// flow — this endpoint used to bypass it entirely.
		if (deductionPayload.deduction_type === 'RETENTION' && orderId) {
			const OrderModel = retentionIsPo ? PurchaseOrder : WorkOrder;
			const order = await OrderModel.findByPk(orderId, {
				attributes: ['retention_amount'],
				transaction,
				lock: transaction.LOCK.UPDATE,
			});
			if (order) {
				await validateRetentionCap({
					requisitionType: requisition.requisition_type,
					order,
					isPo: retentionIsPo,
					orderId,
					org_id,
					newRetentionAmt: parseFloat(deductionPayload.amount) || 0,
					transaction,
				});
			}
		}

		let taxableRatio = 1;
		if (orderId && TAXABLE_BASE_DEDUCTION_TYPES.includes(deductionPayload.deduction_type)) {
			taxableRatio = await getTaxableRatio({
				PurchaseOrder,
				WorkOrder,
				PurchaseInvoice,
				po_id: requisition.po_id,
				wo_id: requisition.wo_id,
				purchase_invoice_id: requisition.purchase_invoice_id,
				transaction,
			});
		}
		const [normalized] = normalizeDeductions([deductionPayload], { gross, taxableRatio });
		const [deduction] = await deductionRepo.bulkCreate(
			[{ ...normalized, payment_requisition_id: Number(requisitionId) }],
			{ transaction },
		);

		// Recalculate totals
		const existingDeductions = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = existingDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('Adding this deduction would make net_payable negative', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable, updated_by_id: req.user.id },
			{ transaction },
		);

		// If this requisition is already APPROVED and the new line is a TDS-type
		// deduction, create its liability right away. No PO/WO re-sync is needed:
		// totalPaid tracks gross_amount requisitioned, which a deduction line never
		// changes (only total_deductions/net_payable move).
		if (requisition.status === 'APPROVED' && TDS_DEDUCTION_TYPES.includes(deduction.deduction_type)) {
			const freshRequisition = await paymentRequisitionRepo.findById(requisitionId, { transaction });
			await tdsLiabilityService.createLiabilitiesForApprovedRequisition(req, freshRequisition, transaction);
		}

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: Number(requisitionId),
			action: 'add_deduction',
			newState: { deduction_type: deduction.deduction_type, amount: deduction.amount },
			transaction,
		});

		await transaction.commit();
		return deduction;
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
};

exports.updateDeduction = async (req, requisitionId, deductionId, deductionPayload) => {
	const transaction = await sequelize.transaction();
	try {
		const { org_id } = req.user;
		const requisition = await paymentRequisitionRepo.findById(requisitionId, { transaction });

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const deduction = await deductionRepo.findById(deductionId, { transaction });
		if (!deduction || deduction.payment_requisition_id !== Number(requisitionId)) {
			throw new AppError('Deduction not found', StatusCodes.NOT_FOUND);
		}

		const existingLiability = await tdsLiabilityRepo.findByDeductionId(deductionId, { transaction });
		if (existingLiability) {
			throw new AppError(
				'This deduction already has a TDS liability on record and can no longer be edited directly. Reverse the liability/settlement first.',
				StatusCodes.CONFLICT,
			);
		}

		const oldAmount = parseFloat(deduction.amount) || 0;
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);

		let taxableRatio = 1;
		if ((requisition.po_id || requisition.wo_id) && TAXABLE_BASE_DEDUCTION_TYPES.includes(deductionPayload.deduction_type)) {
			taxableRatio = await getTaxableRatio({
				PurchaseOrder,
				WorkOrder,
				po_id: requisition.po_id,
				wo_id: requisition.wo_id,
				transaction,
			});
		}
		const [normalized] = normalizeDeductions([deductionPayload], { gross, taxableRatio });
		await deductionRepo.updateById(deductionId, normalized, { transaction });

		const allDeductions = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = allDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const netPayable = gross - totalDed;

		if (netPayable < 0) {
			throw new AppError('Updated deduction makes net_payable negative', StatusCodes.UNPROCESSABLE_ENTITY);
		}

		if (normalized.deduction_type === 'RETENTION') {
			const orderId = requisition.po_id || requisition.wo_id;
			if (orderId) {
				const OrderModel = requisition.po_id ? PurchaseOrder : WorkOrder;
				const idField = requisition.po_id ? 'po_id' : 'wo_id';
				const order = await OrderModel.findByPk(orderId, {
					attributes: ['retention_amount'],
					transaction,
					lock: transaction.LOCK.UPDATE,
				});
				const increase = money.round2(normalized.amount - oldAmount);
				if (order && increase > 0) {
					await validateRetentionCap({
						requisitionType: requisition.requisition_type,
						order,
						idField,
						orderId,
						org_id,
						newRetentionAmt: increase,
						transaction,
					});
				}
			}
		}

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable, updated_by_id: req.user.id },
			{ transaction },
		);

		// No PO/WO re-sync needed here — totalPaid tracks gross_amount, which this
		// endpoint never changes (only total_deductions/net_payable move).

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: Number(requisitionId),
			action: 'update_deduction',
			previousState: { amount: oldAmount },
			newState: { amount: normalized.amount },
			transaction,
		});

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
		const requisition = await paymentRequisitionRepo.findById(requisitionId, { transaction });

		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const deduction = await deductionRepo.findById(deductionId, { transaction });
		if (!deduction || deduction.payment_requisition_id !== Number(requisitionId)) {
			throw new AppError('Deduction not found', StatusCodes.NOT_FOUND);
		}

		const existingLiability = await tdsLiabilityRepo.findByDeductionId(deductionId, { transaction });
		if (existingLiability) {
			throw new AppError(
				'This deduction already has a TDS liability on record and cannot be deleted. Reverse the liability/settlement first.',
				StatusCodes.CONFLICT,
			);
		}

		await deductionRepo.deleteById(deductionId, { transaction });

		const remaining = await deductionRepo.findByRequisitionId(requisitionId, { transaction });
		const totalDed = remaining.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
		const gross = parseFloat(requisition.gross_amount || requisition.requisition_amount || 0);
		const netPayable = gross - totalDed;

		await paymentRequisitionRepo.updateById(
			requisitionId,
			{ total_deductions: totalDed, net_payable: netPayable, tds_amount: totalDed, total_amount: netPayable, updated_by_id: req.user.id },
			{ transaction },
		);

		// No PO/WO re-sync needed here — totalPaid tracks gross_amount, which this
		// endpoint never changes (only total_deductions/net_payable move).

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: Number(requisitionId),
			action: 'delete_deduction',
			previousState: { deduction_type: deduction.deduction_type, amount: deduction.amount },
			transaction,
		});

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
		// A requisition that ever generated a TDS liability can't be hard-deleted —
		// its deduction rows are referenced (RESTRICT) by TdsLiabilities, and more
		// importantly deleting it would destroy the trail back to a real government
		// liability. Cancel (or refuse, if already settled) first via the same path
		// used for a status reversal.
		const liabilityCount = await TdsLiability.count({ where: { payment_requisition_id: id }, transaction });
		if (liabilityCount > 0) {
			throw new AppError(
				'This requisition has TDS liability history and cannot be deleted. Change its status to REJECTED instead (via update) — that path cancels or blocks the liabilities correctly and preserves the record for audit.',
				StatusCodes.CONFLICT,
			);
		}

		// Child deductions are deleted via CASCADE on the FK, but we delete explicitly
		// so the audit log is clear about what happened.
		await deductionRepo.deleteByRequisitionId(id, { transaction });
		await paymentRequisitionRepo.deleteById(id, { transaction });

		if (existing.status === 'APPROVED') {
			const { parentId, ParentModel } = await resolveSyncTarget(
				{ po_id: existing.po_id, wo_id: existing.wo_id, purchase_invoice_id: existing.purchase_invoice_id },
				transaction,
			);
			const amount = poWoSyncAmount(existing);
			if (parentId && amount !== null && amount > 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, -amount, transaction);
			}
		}

		await auditLogService.record({
			req,
			entityType: 'payment_requisition',
			entityId: Number(id),
			action: 'delete',
			previousState: { status: existing.status, gross_amount: existing.gross_amount, net_payable: existing.net_payable },
			transaction,
		});

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

	if (type === 'Invoice') {
		const invoice = await PurchaseInvoice.findOne({
			where: { id, org_id },
			attributes: ['total_taxable', 'grandTotal', 'document_type', 'purchase_order_id', 'work_order_id'],
		});
		if (!invoice) throw new AppError('Purchase Invoice not found', StatusCodes.NOT_FOUND);

		const basicAmount = parseFloat(invoice.total_taxable) || 0;
		const totalAmount = parseFloat(invoice.grandTotal) || 0;

		const [financial, retentionSummary, deductionBreakdown, existingPrCount] = await Promise.all([
			analyticsRepo.getPoWoFinancialSummary({ idField: 'purchase_invoice_id', id, org_id }),
			invoice.document_type === 'work_order'
				? analyticsRepo.getRetentionSummaryForWo({ woId: invoice.work_order_id, org_id })
				: analyticsRepo.getRetentionSummaryForPo({ poId: invoice.purchase_order_id, org_id }),
			analyticsRepo.getDeductionBreakdownByPoWo({ idField: 'purchase_invoice_id', id, org_id }),
			PaymentRequisition.count({ where: { purchase_invoice_id: id, status: { [Op.ne]: 'REJECTED' } } }),
		]);

		const totalGross = parseFloat(financial?.total_gross || 0);
		const totalNetPaid = parseFloat(financial?.total_net_paid || 0);
		const totalDeductions = parseFloat(financial?.total_deductions || 0);

		// One Purchase Invoice <-> at most one non-rejected PR (locked decision):
		// remaining is simply the full invoice value until a PR is raised, then
		// zero — no partial-drawdown running balance to compute, since the
		// invoice's own grandTotal was already receipt-capped at creation.
		const remainingAmount = existingPrCount > 0 ? 0 : totalAmount;

		return {
			poWoBasicAmount: basicAmount,
			poWoExpInvAmount: totalAmount,
			receivedValue: totalAmount,
			payableCap: totalAmount,
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
	}

	const idField = type === 'PO' ? 'po_id' : 'wo_id';
	const Model = type === 'PO' ? PurchaseOrder : WorkOrder;

	const record = await Model.findOne({ where: { id, org_id }, attributes: ['total_taxable', 'grandTotal'] });
	if (!record) throw new AppError(`${type} not found`, StatusCodes.NOT_FOUND);

	const basicAmount = parseFloat(record.total_taxable) || 0;
	const totalAmount = parseFloat(record.grandTotal) || 0;

	// PO/WO-direct closes once any active Purchase Invoice exists for it —
	// the requisition must go through the invoice from then on.
	{
		const activeInvoiceCount = await PurchaseInvoice.count({
			where:
				type === 'PO'
					? { document_type: 'purchase_order', purchase_order_id: id, status: { [Op.notIn]: ['rejected', 'cancelled'] } }
					: { document_type: 'work_order', work_order_id: id, status: { [Op.notIn]: ['rejected', 'cancelled'] } },
		});
		if (activeInvoiceCount > 0) {
			return {
				poWoBasicAmount: basicAmount,
				poWoExpInvAmount: totalAmount,
				receivedValue: null,
				payableCap: 0,
				totalGross: 0,
				totalDeductions: 0,
				totalNetPaid: 0,
				remainingAmount: 0,
				requiresInvoice: true,
				totalReqCount: 0,
				pendingCount: 0,
				retention: { held: 0, released: 0, balance: 0 },
				deductionBreakdown: [],
			};
		}
	}

	const [financial, retentionSummary, deductionBreakdown] = await Promise.all([
		analyticsRepo.getPoWoFinancialSummary({ idField, id, org_id }),
		type === 'PO'
			? analyticsRepo.getRetentionSummaryForPo({ poId: id, org_id })
			: analyticsRepo.getRetentionSummaryForWo({ woId: id, org_id }),
		analyticsRepo.getDeductionBreakdownByPoWo({ idField, id, org_id }),
	]);

	const totalGross = parseFloat(financial?.total_gross || 0);
	const totalNetPaid = parseFloat(financial?.total_net_paid || 0);
	const totalDeductions = parseFloat(financial?.total_deductions || 0);

	// PO-direct requisitions are capped at what's actually been received, not
	// the PO's full grandTotal — a short-closed or partially-received PO can't
	// be requisitioned for value that never arrived. WO has no MRN-equivalent
	// receipt ledger yet, so it keeps the uncapped grandTotal ceiling.
	let receivedValue = null;
	let payableCap = totalAmount;
	if (type === 'PO') {
		receivedValue = await getPoReceivedValue(id);
		payableCap = Math.min(totalAmount, receivedValue);
	}
	const remainingAmount = Math.max(0, payableCap - totalGross);

	return {
		poWoBasicAmount: basicAmount,
		poWoExpInvAmount: totalAmount,
		receivedValue,
		payableCap,
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

	// Validate that we are not releasing more than what is held. Retention is
	// checked across both payment paths (getRetentionSummaryForPo/Wo) since it
	// accumulates against one shared per-order cap regardless of whether it
	// was withheld via a direct requisition or an Invoice-anchored one.
	const { org_id } = req.user;
	const retentionSummary =
		requisitionAgainst === 'PO'
			? await analyticsRepo.getRetentionSummaryForPo({ poId: poWoId, org_id })
			: await analyticsRepo.getRetentionSummaryForWo({ woId: poWoId, org_id });

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

	// Live taxable/GST/gross breakdown of the linked PO/WO — not stored on the
	// requisition itself (wo_po_amount is just a snapshot of whatever base this
	// requisition's % was applied to), fetched fresh so the print-out shows the
	// same taxable-value context the TDS calculation actually used.
	let po_wo_taxable = null;
	let po_wo_tax = null;
	let po_wo_grand_total = null;
	const orderModel = data.po_id ? PurchaseOrder : data.wo_id ? WorkOrder : null;
	const orderId = data.po_id || data.wo_id;
	if (orderModel && orderId) {
		const order = await orderModel.findByPk(orderId, { attributes: ['total_taxable', 'total_tax', 'grandTotal'] });
		if (order) {
			po_wo_taxable = parseFloat(order.total_taxable) || 0;
			po_wo_tax = parseFloat(order.total_tax) || 0;
			po_wo_grand_total = parseFloat(order.grandTotal) || 0;
		}
	}

	return { ...data, businessLogo, business, cost_center_name, po_wo_taxable, po_wo_tax, po_wo_grand_total };
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
