const { Op } = require('sequelize');
const {
	Budget,
	Indent,
	IndentItem,
	PurchaseOrder,
	PurchaseOrderItem,
	WorkOrder,
	WorkOrderItem,
	PurchaseInvoice,
	PurchaseInvoiceItem,
	RateContract,
	RateContractProduct,
	RateContractUnitItem,
} = require('../models/index');

// Documents in these states are dead and never read the VCP product again, so they
// don't pin it. Everything else (draft through completed) still does.
const DEAD_DOC_STATUSES = ['cancelled', 'rejected'];
const DEAD_RC_STATUSES = ['superseded', 'expired', 'cancelled'];
const SAMPLE_SIZE = 5;

const distinctDocs = (rows, key, label) => {
	const seen = new Map();
	for (const row of rows) {
		const doc = row[key];
		if (doc && !seen.has(doc.id)) seen.set(doc.id, doc[label] || `#${doc.id}`);
	}
	return [...seen.values()];
};

const summarize = (document, refs) => ({
	document,
	count: refs.length,
	refs: refs.slice(0, SAMPLE_SIZE),
});

// Which live SCM documents still reference a VCP product id — called by VCP before it
// deactivates a product, since VCP can't see SCM's tables. product_id is VCP's own
// primary key, so it is unique across organizations and needs no org filter here.
exports.getProductUsage = async (productId) => {
	const product_id = Number(productId);
	const liveDoc = { status: { [Op.notIn]: DEAD_DOC_STATUSES } };

	const [indentItems, poItems, woItems, piItems, rcDirect, rcProducts, rcUnitItems, budgetCount] =
		await Promise.all([
			IndentItem.findAll({
				where: { product_id },
				attributes: ['id'],
				include: [{ model: Indent, as: 'indent', where: liveDoc, attributes: ['id', 'indent_no'] }],
			}),
			PurchaseOrderItem.findAll({
				where: { product_id },
				attributes: ['id'],
				include: [
					{ model: PurchaseOrder, as: 'purchaseOrder', where: liveDoc, attributes: ['id', 'doc_number'] },
				],
			}),
			WorkOrderItem.findAll({
				where: { product_id },
				attributes: ['id'],
				include: [{ model: WorkOrder, as: 'workOrder', where: liveDoc, attributes: ['id', 'doc_number'] }],
			}),
			PurchaseInvoiceItem.findAll({
				where: { product_id },
				attributes: ['id'],
				include: [
					{ model: PurchaseInvoice, as: 'purchaseInvoice', where: liveDoc, attributes: ['id', 'invoiceNo'] },
				],
			}),
			RateContract.findAll({
				where: { product_id, status: { [Op.notIn]: DEAD_RC_STATUSES } },
				attributes: ['id', 'family_number'],
			}),
			RateContractProduct.findAll({
				where: { product_id },
				attributes: ['id'],
				include: [
					{
						model: RateContract,
						as: 'rateContract',
						where: { status: { [Op.notIn]: DEAD_RC_STATUSES } },
						attributes: ['id', 'family_number'],
					},
				],
			}),
			RateContractUnitItem.findAll({ where: { product_id }, attributes: ['rate_contract_id'] }),
			Budget.count({ where: { product_id } }),
		]);

	// Unit-item mappings carry no association to RateContract, so resolve their
	// contracts' status separately and fold them into the same list.
	const unitRcIds = [...new Set(rcUnitItems.map((r) => r.rate_contract_id).filter(Boolean))];
	const unitRcs = unitRcIds.length
		? await RateContract.findAll({
				where: { id: unitRcIds, status: { [Op.notIn]: DEAD_RC_STATUSES } },
				attributes: ['id', 'family_number'],
			})
		: [];

	const rateContracts = new Map();
	for (const rc of [...rcDirect, ...rcProducts.map((r) => r.rateContract), ...unitRcs]) {
		if (rc && !rateContracts.has(rc.id)) rateContracts.set(rc.id, rc.family_number || `#${rc.id}`);
	}

	const usage = [
		summarize('Indent', distinctDocs(indentItems, 'indent', 'indent_no')),
		summarize('Purchase Order', distinctDocs(poItems, 'purchaseOrder', 'doc_number')),
		summarize('Work Order', distinctDocs(woItems, 'workOrder', 'doc_number')),
		summarize('Purchase Invoice', distinctDocs(piItems, 'purchaseInvoice', 'invoiceNo')),
		summarize('Rate Contract', [...rateContracts.values()]),
		{ document: 'Budget', count: budgetCount, refs: [] },
	].filter((u) => u.count > 0);

	return { product_id, in_use: usage.length > 0, usage };
};
