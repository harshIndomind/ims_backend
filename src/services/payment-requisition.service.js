const { sequelize, PaymentRequisition, PurchaseOrder, WorkOrder, User, organization, Role, CostCenter } = require('../models/index');
const { Op, fn, col, literal } = require('sequelize');
const paymentRequisitionRepo = require('../repository/payment-requisition.repository');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { StatusCodes } = require('http-status-codes');
const { generateInvoiceHTML, generateInvoiceHTMLPDF } = require('../pdf/htmlPdfGenerator');
const { generateSignedUrl } = require('../utils/s3Bucket');
const fs = require('fs');
const path = require('path');
const { BASE_URL } = require('../config/serverConfig');

/**
 * Generate the next requisition number preview (before creation).
 * Pattern: PR-XXXXXX (zero-padded to 6 digits)
 */
exports.getNextRequisitionNo = async (req) => {
	const { org_id } = req.user;

	const last = await paymentRequisitionRepo.findLastCreated({ org_id });

	if (!last) {
		logger.debug('No previous requisition found, starting from PR-000001', { org_id });
		return 'PR-000001';
	}

	const lastId = last.id;
	const next = String(lastId + 1).padStart(6, '0');

	logger.debug('Generated next requisition no', { org_id, lastId, nextNo: `PR-${next}` });
	return `PR-${next}`;
};

/**
 * Create a new payment requisition.
 */
exports.createPaymentRequisition = async (req, payload) => {
	const transaction = await sequelize.transaction();

	try {
		const user = req.user;

		const {
			wo_no,
			requisitionAgainst,
			poWoId,
			supplier_id,
			cost_center_id,
			supplier_snapshot,
			bankDetailsSnapshot,
			poWoDate,
			woPOAmount,
			requisitionValuePercent,
			requisitionAmount,
			tdsPercent,
			tdsAmount,
			totalAmount,
			projectCode,
			projectName,
			activityId,
			budgetId,
			authorizedById,
			paymentDate,
			remark,
			termCondition,
			payment_term_id,
			paymentType,
			transactionId,
			status,
		} = payload;

		const fedBy = {
			id: user.id,
			name: user.name,
			email: user.email,
		};

		const po_id = requisitionAgainst === 'PO' && poWoId ? Number(poWoId) : null;
		const wo_id = requisitionAgainst === 'WO' && poWoId ? Number(poWoId) : null;

		logger.info('Creating payment requisition', {
			org_id: user.org_id,
			user_id: user.id,
			requisitionAgainst,
			po_id,
			wo_id,
		});

		const requisition = await paymentRequisitionRepo.create(
			{
				org_id: user.org_id,
				requisition_date: new Date(),
				requisition_against: requisitionAgainst,
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
				requisition_amount: Number(requisitionAmount) || 0,
				tds_percent: Number(tdsPercent) || 0,
				tds_amount: Number(tdsAmount) || 0,
				total_amount: Number(totalAmount) || 0,
				project_code: projectCode || null,
				project_name: projectName || null,
				activity_id: activityId || null,
				budget_id: budgetId || null,
				fed_by_id: user.id,
				fed_by: fedBy,
				// authorized_by_id: authorizedById ? Number(authorizedById) : null,
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

		// Generate and assign requisition number after insert (get real auto-inc id)
		const requisitionNo = `PR-${String(requisition.id).padStart(6, '0')}`;
		await paymentRequisitionRepo.updateById(
			requisition.id,
			{ requisition_no: requisitionNo },
			{ transaction },
		);

		await transaction.commit();

		logger.info('Payment requisition created successfully', {
			requisition_id: requisition.id,
			requisition_no: requisitionNo,
			org_id: user.org_id,
		});

		return { ...requisition.toJSON(), requisition_no: requisitionNo };
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to create payment requisition', {
			error: error.message,
			org_id: req.user?.org_id,
		});
		throw error;
	}
};

/**
 * Fetch all payment requisitions for the org.
 */
exports.getAllPaymentRequisitions = async (req) => {
	const { org_id } = req.user;

	logger.debug('Fetching all payment requisitions', { org_id });

	const data = await paymentRequisitionRepo.findAll({ org_id });

	logger.info('Payment requisitions fetched', {
		org_id,
		count: data.count,
	});

	return data;
};

/**
 * Fetch a single payment requisition by id.
 */
exports.getPaymentRequisitionById = async (req, id) => {
	const { org_id } = req.user;

	logger.debug('Fetching payment requisition by id', { id, org_id });

	const requisition = await paymentRequisitionRepo.findById(id);

	if (!requisition || requisition.org_id !== org_id) {
		logger.warn('Payment requisition not found or unauthorized', { id, org_id });
		throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
	}

	return requisition;
};

/**
 * Recalculate and update totalPaid, remainingAmount, paymentStatus on a PO or WO.
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
		modelName: Model.name,
		id,
		amountDelta,
		newTotalPaid,
		newRemainingAmount,
		newPaymentStatus,
	});
}

/**
 * Update an existing payment requisition.
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
			poWoId,
			wo_no,
			supplier_id,
			supplier_snapshot,
			bankDetailsSnapshot,
			poWoDate,
			woPOAmount,
			requisitionValuePercent,
			requisitionAmount,
			tdsPercent,
			tdsAmount,
			totalAmount,
			projectCode,
			projectName,
			activityId,
			budgetId,
			authorizedById,
			paymentDate,
			remark,
			termCondition,
			payment_term_id,
			paymentType,
			transactionId,
			status,
		} = payload;

		const po_id = requisitionAgainst === 'PO' && poWoId ? Number(poWoId) : null;
		const wo_id = requisitionAgainst === 'WO' && poWoId ? Number(poWoId) : null;

		const authorizedBy = {
			id: req.user.id,
			name: req.user.name,
			email: req.user.email,
		};

		logger.info('Updating payment requisition', { id, org_id });

		await paymentRequisitionRepo.updateById(
			id,
			{
				requisition_against: requisitionAgainst,
				supplier_id: supplier_id ? Number(supplier_id) : null,
				supplier_snapshot: supplier_snapshot ?? null,
				bank_details_snapshot: bankDetailsSnapshot ?? null,
				po_id,
				wo_id,
				wo_no,
				po_wo_date: poWoDate || null,
				wo_po_amount: woPOAmount ? Number(woPOAmount) : 0,
				requisition_value_percent: Number(requisitionValuePercent) || 0,
				requisition_amount: Number(requisitionAmount) || 0,
				tds_percent: Number(tdsPercent) || 0,
				tds_amount: Number(tdsAmount) || 0,
				total_amount: Number(totalAmount) || 0,
				project_code: projectCode || null,
				project_name: projectName || null,
				activity_id: activityId || null,
				budget_id: budgetId || null,
				authorized_by_id: authorizedBy ? Number(authorizedBy.id) : null,
				authorized_by: authorizedBy,
				payment_date: paymentDate || null,
				remark: remark || null,
				term_condition: termCondition || null,
				payment_term_id,
				payment_type: paymentType || null,
				transaction_id: transactionId || null,
				status: status || undefined,
			},
			{ transaction },
		);

		// Sync totalPaid / remainingAmount / paymentStatus on the parent PO or WO
		const oldStatus = existing.status;
		const newStatus = status || oldStatus;
		const oldAmount = parseFloat(existing.requisition_amount) || 0;
		const newAmount = Number(requisitionAmount) != null ? Number(requisitionAmount) : oldAmount;
		const parentId = po_id || wo_id || existing.po_id || existing.wo_id;
		const ParentModel = (requisitionAgainst || existing.requisition_against) === 'PO' ? PurchaseOrder : WorkOrder;

		if (parentId) {
			let amountDelta = 0;
			if (oldStatus === 'APPROVED') amountDelta -= oldAmount;
			if (newStatus === 'APPROVED') amountDelta += newAmount;

			if (amountDelta !== 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, amountDelta, transaction);
			}
		}

		await transaction.commit();

		logger.info('Payment requisition updated successfully', { id, org_id });

		return paymentRequisitionRepo.findById(id);
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to update payment requisition', {
			id,
			error: error.message,
			org_id: req.user?.org_id,
		});
		throw error;
	}
};

/**
 * Delete a payment requisition.
 */
exports.deletePaymentRequisition = async (req, id) => {
	const { org_id } = req.user;

	const existing = await paymentRequisitionRepo.findById(id);

	if (!existing || existing.org_id !== org_id) {
		logger.warn('Delete attempted on non-existent or unauthorized requisition', { id, org_id });
		throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
	}

	const transaction = await sequelize.transaction();

	try {
		logger.info('Deleting payment requisition', { id, org_id });

		await paymentRequisitionRepo.deleteById(id, { transaction });

		// If the requisition was APPROVED, reverse its contribution to totalPaid on the parent PO/WO
		if (existing.status === 'APPROVED') {
			const parentId = existing.po_id || existing.wo_id;
			const ParentModel = existing.requisition_against === 'PO' ? PurchaseOrder : WorkOrder;
			const amount = parseFloat(existing.requisition_amount) || 0;

			if (parentId && amount > 0) {
				await syncPoWoPaymentFields(ParentModel, parentId, org_id, -amount, transaction);
			}
		}

		await transaction.commit();

		logger.info('Payment requisition deleted', { id, org_id });
	} catch (error) {
		await transaction.rollback();
		logger.error('Failed to delete payment requisition', { id, error: error.message, org_id });
		throw error;
	}
};

/**
 * Get payment summary for a specific PO or WO.
 * Returns counts + amounts of all non-rejected requisitions against it.
 */
exports.getPoWoSummary = async (req, type, id) => {
	const { org_id } = req.user;

	// Fetch the PO/WO to get its basic amount
	let basicAmount = 0;
	if (type === 'PO') {
		const po = await PurchaseOrder.findOne({
			where: { id, org_id },
			attributes: ['grandTotal'],
		});
		if (!po) throw new AppError('Purchase order not found', StatusCodes.NOT_FOUND);
		basicAmount = parseFloat(po.grandTotal) || 0;
	} else {
		const wo = await WorkOrder.findOne({
			where: { id, org_id },
			attributes: ['grandTotal'],
		});
		if (!wo) throw new AppError('Work order not found', StatusCodes.NOT_FOUND);
		basicAmount = parseFloat(wo.grandTotal) || 0;
	}

	// Aggregate all non-rejected requisitions for this PO/WO
	const idFilter = type === 'PO' ? { po_id: Number(id) } : { wo_id: Number(id) };

	const result = await PaymentRequisition.findOne({
		where: {
			...idFilter,
			org_id,
			status: { [Op.ne]: 'REJECTED' },
		},
		attributes: [
			[fn('COUNT', col('id')), 'totalReqCount'],
			[fn('SUM', col('requisition_amount')), 'reqFedAmount'],
			[fn('SUM', literal(`CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END`)), 'pendingCount'],
		],
		raw: true,
	});

	const totalReqCount = parseInt(result?.totalReqCount || 0);
	const reqFedAmount = parseFloat(result?.reqFedAmount || 0);
	const pendingCount = parseInt(result?.pendingCount || 0);
	const remainingAmount = Math.max(0, basicAmount - reqFedAmount);

	logger.debug('PO/WO summary computed', {
		type,
		id,
		basicAmount,
		reqFedAmount,
		remainingAmount,
		totalReqCount,
		pendingCount,
	});

	return {
		totalReqCount,
		poWoBasicAmount: basicAmount,
		poWoExpInvAmount: basicAmount,
		invoiceAmount: 0,
		reqFedAmount,
		remainingAmount,
		pendingCount,
	};
};

/**
 * Build the data object for the payment requisition EJS template.
 */
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
		if (userData.logo) {
			businessLogo = await generateSignedUrl(userData.logo);
		}
	}

	let cost_center_name = null;
	if (data.cost_center_id) {
		const cc = await CostCenter.findByPk(data.cost_center_id, { attributes: ['name'] });
		cost_center_name = cc?.name ?? null;
	}

	return {
		...data,
		businessLogo,
		business,
		cost_center_name,
	};
}

/**
 * Generate HTML for a payment requisition.
 */
exports.generateRequisitionHtml = async (req) => {
	try {
		const { id } = req.params;
		const { org_id } = req.user;

		const requisition = await paymentRequisitionRepo.findById(id);
		if (!requisition || requisition.org_id !== org_id) {
			throw new AppError('Payment requisition not found', StatusCodes.NOT_FOUND);
		}

		const templateData = await buildRequisitionTemplateData(requisition);
		const html = await generateInvoiceHTML(templateData, 'paymentRequisitionTemplate');

		return `<div class="preview-page">${html}</div>`;
	} catch (err) {
		logger.error('Failed to generate payment requisition HTML', { error: err.message });
		throw new AppError('Failed to generate HTML');
	}
};

/**
 * Generate a PDF file for a payment requisition and return its public URL.
 */
exports.downloadRequisitionPdf = async (req) => {
	try {
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
		await page.pdf({
			path: pdfPath,
			format: 'A4',
			printBackground: true,
			margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
		});
		await browser.close();

		const baseUrl = BASE_URL || 'http://localhost:5000';
		return `${baseUrl}/storage/payment-requisitions/${pdfName}`;
	} catch (err) {
		logger.error('Failed to generate payment requisition PDF', { error: err.message });
		throw new AppError('Failed to generate PDF');
	}
};
