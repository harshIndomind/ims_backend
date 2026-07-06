const {
	DocumentsUpload,
	User,
	Role,
	organization,
	BusinessPartner,
	MasterMajorHead,
	MasterMajorHeadAmount,
	MasterSubHead,
	MasterSubHeadAmount,
	Budget,
	Indent,
	PurchaseOrder,
	PaymentRequisition,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const { Op, fn, col, literal } = require('sequelize');

async function getOrganizationsCount() {
	const count = await organization.count();
	return count;
}

async function getVendorsCount(organizationId) {
	let whereClause = {};
	if (organizationId > 0) {
		whereClause = { organization_id: organizationId };
	}
	const count = await BusinessPartner.count({
		where: whereClause,
	});
	return count;
}

async function getDocumentsCount() {
	const count = await DocumentsUpload.count();
	return count;
}

async function getDocumentsCountByVendorId(organizationId, vendorId) {
	const where = {};

	if (parseInt(vendorId) > 0) {
		where['where'] = { partner_id: vendorId };
	} else if (parseInt(organizationId) > 0) {
		const orgVendors = await BusinessPartner.findAll({
			where: { organization_id: organizationId },
			attributes: ['id'],
			raw: true,
		});

		const vendorIds = orgVendors.map((v) => v.id);
		console.log('vendorIds ', vendorIds);

		where['where'] = { partner_id: { [Op.in]: vendorIds } };
	}
	console.log('where ', where);

	const count = await DocumentsUpload.count(where);

	return count;
}

exports.getDashboardCounts = catchAsync(async (req, res) => {
	const role = req.user.role;

	const businessPartner = await BusinessPartner.findOne({
		where: { user_id: req.user.id },
	});

	let vendorId = businessPartner?.id ?? '';
	let organizationId = req.query.organizationId;
	if (role !== 'Vendor') {
		vendorId = req.query.vendorId;
		organizationId = req.query.organizationId;
	}
	let organizationsCount = 1;
	if (role === 'Super Admin') {
		organizationsCount = await getOrganizationsCount();
	}

	let vendorsCount = 0;
	if (role === 'Admin' || role === 'Super Admin') {
		vendorsCount = await getVendorsCount(organizationId);
	}

	const documentsCount = await getDocumentsCount();
	const documentsVendorCount = await getDocumentsCountByVendorId(
		organizationId,
		vendorId
	);
	const counts = {};
	// if (organizationsCount && vendorsCount) {
		counts['organizationsCount'] = organizationsCount;
		counts['vendorsCount'] = vendorsCount;
		// counts['documentsCount'] = documentsCount;
		counts['vendorDocumentsCount'] = documentsVendorCount;
	// }

	res.status(200).json({
		status: true,
		message: 'Dashboard counts fetched successfully',
		data: counts,
	});
});

exports.getMasterHeadCounts = catchAsync(async (req, res) => {
	const { org_id } = req.user;

	const [masterHeadCount, masterHeadTotalAmount, subHeadCount, subHeadTotalAmount] =
		await Promise.all([
			MasterMajorHead.count({ where: { org_id } }),
			MasterMajorHeadAmount.sum('amount', { where: { org_id } }),
			MasterSubHead.count({ where: { org_id } }),
			MasterSubHeadAmount.sum('amount', { where: { org_id } }),
		]);

	res.status(200).json({
		status: true,
		message: 'Master head counts fetched successfully',
		data: {
			masterHeadCount,
			masterHeadTotalAmount: masterHeadTotalAmount || 0,
			subHeadCount,
			subHeadTotalAmount: subHeadTotalAmount || 0,
		},
	});
});

exports.getDashboardChartsData = catchAsync(async (req, res) => {
	const role = req.user.role;
	const user_id = req.user.id;
	const { timeRange, vendorId, organizationId } = req.query;

	let whereCondition = {};

	// 1️⃣ Vendor-based role → restrict to vendor’s own BP
	if (['Vendor', 'Vendor-Customer'].includes(role)) {
		const businessPartner = await BusinessPartner.findOne({
			where: { user_id },
			attributes: ['id'],
		});
		whereCondition.partner_id = businessPartner.id;
	} else {
		// 2️⃣ If vendorId explicitly provided → highest priority
		if (parseInt(vendorId) > 0) {
			whereCondition.partner_id = vendorId;
		}
		// 3️⃣ If organizationId provided → get all vendor IDs from that org
		else if (parseInt(organizationId) > 0) {
			const orgVendors = await BusinessPartner.findAll({
				where: { organization_id: organizationId },
				attributes: ['id'],
				raw: true,
			});

			const vendorIds = orgVendors.map((v) => v.id);

			whereCondition.partner_id = { [Op.in]: vendorIds };
		}
	}

	// 4️⃣ Date filter
	const now = new Date();
	let pastDate = new Date();

	if (timeRange === '7d') {
		pastDate.setDate(now.getDate() - 7);
	} else if (timeRange === '30d') {
		pastDate.setDate(now.getDate() - 30);
	} else {
		pastDate.setDate(now.getDate() - 90);
	}

	whereCondition.createdAt = { [Op.gte]: pastDate };

	// 5️⃣ Get Stats
	const uploadStats = await DocumentsUpload.findAll({
		where: whereCondition,
		attributes: [
			[fn('DATE', col('createdAt')), 'date'],
			[fn('COUNT', col('id')), 'uploads'],
		],
		group: [fn('DATE', col('createdAt'))],
		order: [[fn('DATE', col('createdAt')), 'ASC']],
		raw: true,
	});

	res.status(200).json({
		status: true,
		message: 'Dashboard charts data fetched successfully',
		data: uploadStats,
	});
});

exports.getDashboardSummary = catchAsync(async (req, res) => {
	const { org_id } = req.user;
	const { period_id, unit_id, department_id } = req.query;

	// Build base where clauses
	const base = { org_id };
	if (period_id)     base.period_id     = Number(period_id);
	if (unit_id)       base.unit_id       = Number(unit_id);
	if (department_id) base.department_id = Number(department_id);

	const budgetWhere = { ...base };
	const indentWhere = { ...base };
	// PO has no period_id / unit_id columns — filter only by org
	const poWhere = { org_id };

	// Head-amount where (no unit/dept)
	const headWhere = { org_id };
	if (period_id) headWhere.period_id = Number(period_id);

	const [
		// Budget
		budgetTotal,
		budgetApproved,
		budgetLocked,
		budgetAmount,
		// Indent
		indentTotal,
		indentApproved,
		indentInProgress,
		// PO
		poTotal,
		poApproved,
		poGrandTotal,
		// PR
		prTotal,
		prPending,
		prApproved,
		// Heads
		majorHeadCount,
		majorHeadAmount,
		subHeadCount,
		subHeadAmount,
	] = await Promise.all([
		// Budget
		Budget.count({ where: budgetWhere }),
		Budget.count({ where: { ...budgetWhere, sanc_by: 'yes' } }),
		Budget.count({ where: { ...budgetWhere, is_lock: true } }),
		Budget.sum('amount', { where: budgetWhere }),
		// Indent
		Indent.count({ where: indentWhere }),
		Indent.count({ where: { ...indentWhere, status: 'approved' } }),
		Indent.count({ where: { ...indentWhere, status: 'in_progress' } }),
		// PO
		PurchaseOrder.count({ where: poWhere }),
		PurchaseOrder.count({ where: { ...poWhere, status: 'approved' } }),
		PurchaseOrder.sum('grandTotal', { where: poWhere }),
		// PR
		PaymentRequisition.count({ where: { org_id } }),
		PaymentRequisition.count({ where: { org_id, status: 'PENDING' } }),
		PaymentRequisition.count({ where: { org_id, status: 'APPROVED' } }),
		// Heads (period-filtered)
		MasterMajorHead.count({ where: { org_id } }),
		MasterMajorHeadAmount.sum('amount', { where: headWhere }),
		MasterSubHead.count({ where: { org_id } }),
		MasterSubHeadAmount.sum('amount', { where: headWhere }),
	]);

	res.status(200).json({
		status: true,
		message: 'Dashboard summary fetched successfully',
		data: {
			budget: {
				total: budgetTotal,
				approved: budgetApproved,
				pending: budgetTotal - budgetApproved,
				locked: budgetLocked,
				totalAmount: budgetAmount || 0,
			},
			indent: {
				total: indentTotal,
				approved: indentApproved,
				inProgress: indentInProgress,
				pending: indentTotal - indentApproved - indentInProgress,
			},
			purchaseOrder: {
				total: poTotal,
				approved: poApproved,
				totalValue: poGrandTotal || 0,
			},
			paymentRequisition: {
				total: prTotal,
				pending: prPending,
				approved: prApproved,
			},
			heads: {
				majorHeadCount,
				majorHeadAmount: majorHeadAmount || 0,
				subHeadCount,
				subHeadAmount: subHeadAmount || 0,
			},
		},
	});
});
