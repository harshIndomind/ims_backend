const { TdsLiability, TdsSettlementAllocation, TdsSettlement, PaymentRequisition } = require('../models/index');
const { Op } = require('sequelize');

const detailInclude = [
	{
		model: PaymentRequisition,
		as: 'paymentRequisition',
		attributes: ['id', 'requisition_no', 'requisition_date', 'payment_date', 'status'],
	},
	{
		model: TdsSettlementAllocation,
		as: 'allocations',
		include: [{ model: TdsSettlement, as: 'settlement', attributes: ['id', 'settlement_date', 'challan_number', 'status'] }],
	},
];

exports.create = async (data, options = {}) => {
	return TdsLiability.create(data, options);
};

exports.findById = async (id, options = {}) => {
	return TdsLiability.findOne({ where: { id }, include: detailInclude, ...options });
};

exports.findByIdForUpdate = async (id, transaction) => {
	return TdsLiability.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
};

exports.findByDeductionId = async (payment_requisition_deduction_id, options = {}) => {
	return TdsLiability.findOne({ where: { payment_requisition_deduction_id }, ...options });
};

exports.findAll = async (where = {}, { limit, offset } = {}) => {
	return TdsLiability.findAndCountAll({
		where,
		include: [
			{
				model: PaymentRequisition,
				as: 'paymentRequisition',
				attributes: ['id', 'requisition_no', 'requisition_date', 'payment_date'],
			},
		],
		order: [['liability_date', 'DESC'], ['id', 'DESC']],
		distinct: true,
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
	});
};

exports.buildFilterWhere = ({ org_id, fromDate, toDate, po_id, wo_id, vendor_id, status, payment_requisition_id }) => {
	const where = { org_id };
	if (fromDate && toDate) {
		where.liability_date = { [Op.gte]: fromDate, [Op.lte]: toDate };
	}
	if (po_id) where.po_id = po_id;
	if (wo_id) where.wo_id = wo_id;
	if (vendor_id) where.vendor_id = vendor_id;
	if (status && status !== 'all') where.status = status;
	if (payment_requisition_id) where.payment_requisition_id = payment_requisition_id;
	return where;
};

exports.updateById = async (id, data, options = {}) => {
	return TdsLiability.update(data, { where: { id }, ...options });
};

exports.getSummary = async ({ org_id, fromDate, toDate }) => {
	const { sequelize } = require('../models/index');
	const { QueryTypes } = require('sequelize');
	const rows = await sequelize.query(
		`
		SELECT
			COUNT(id)                                                        AS liability_count,
			COALESCE(SUM(tds_amount), 0)                                     AS total_liability,
			COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN amount_settled ELSE 0 END), 0) AS total_paid,
			COALESCE(SUM(CASE WHEN status IN ('UNPAID','PARTIALLY_PAID') THEN tds_amount - amount_settled ELSE 0 END), 0) AS total_outstanding
		FROM TdsLiabilities
		WHERE org_id = :org_id
		  AND status != 'CANCELLED'
		  ${fromDate && toDate ? 'AND liability_date BETWEEN :fromDate AND :toDate' : ''}
		`,
		{ replacements: { org_id, fromDate, toDate }, type: QueryTypes.SELECT, plain: true },
	);
	return rows;
};
