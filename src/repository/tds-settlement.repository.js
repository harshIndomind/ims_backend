const { TdsSettlement, TdsSettlementAllocation, TdsLiability } = require('../models/index');

const detailInclude = [
	{
		model: TdsSettlementAllocation,
		as: 'allocations',
		include: [{ model: TdsLiability, as: 'liability' }],
	},
];

exports.create = async (data, options = {}) => {
	return TdsSettlement.create(data, options);
};

exports.findById = async (id, options = {}) => {
	return TdsSettlement.findOne({ where: { id }, include: detailInclude, ...options });
};

exports.findByIdForUpdate = async (id, transaction) => {
	return TdsSettlement.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
};

exports.findAll = async (where = {}, { limit, offset } = {}) => {
	return TdsSettlement.findAndCountAll({
		where,
		include: detailInclude,
		order: [['settlement_date', 'DESC'], ['id', 'DESC']],
		distinct: true,
		limit: limit ? Number(limit) : undefined,
		offset: offset ? Number(offset) : undefined,
	});
};

exports.updateById = async (id, data, options = {}) => {
	return TdsSettlement.update(data, { where: { id }, ...options });
};

exports.createAllocations = async (rows, options = {}) => {
	return TdsSettlementAllocation.bulkCreate(rows, options);
};

exports.findAllocationsBySettlementId = async (tds_settlement_id, options = {}) => {
	return TdsSettlementAllocation.findAll({ where: { tds_settlement_id }, ...options });
};
