/**
 * Glue between the generic charge-tax-engine.util.js and the PO/WO service
 * layer's request payload / document_charges table shapes. Shared by
 * purchase-order.service.js and work-order.service.js since both documents
 * use byte-identical item/charge/DB-row shapes.
 */
const { round2 } = require('./money');

/** Maps a PO/WO productItems row into the engine's generic item shape. */
function toEngineItems(productItems) {
	return (productItems || []).map((item) => ({
		qty: item.qty,
		price: item.price,
		discount: item.discount,
		discountType: item.discount_price_type,
		rate: parseFloat(item.taxSnapshot?.rate ?? 0) || 0,
		cess: item.cess,
	}));
}

/** Maps the engine's computed charge breakdown into document_charges row shape. */
function chargeBreakdownToRows(breakdown) {
	return (breakdown || []).map((c, index) => ({
		name: c.name,
		calculation_type: c.calculationType,
		value: c.value,
		operation: c.operation,
		apply_on: c.applyOn,
		tax_treatment: c.appliedTaxTreatment || c.taxTreatment,
		tax_rate: c.taxRate ?? null,
		// Absent (legacy/older clients) = counts against the budget, same as the column default.
		budget_impact: c.budgetImpact !== false,
		sequence: c.sequence ?? index,
		taxable_amount: c.amount,
		cgst: c.cgst,
		sgst: c.sgst,
		igst: c.igst,
		cess: 0,
		total: round2((c.amount || 0) + (c.tax || 0)),
	}));
}

/** Reverse of the above, for read paths — reconstructs Charge[] from persisted rows. */
function dbRowsToCharges(rows) {
	return (rows || []).map((row) => ({
		id: row.id,
		name: row.name,
		calculationType: row.calculation_type,
		value: parseFloat(row.value),
		operation: row.operation,
		applyOn: row.apply_on,
		taxTreatment: row.tax_treatment,
		taxRate: row.tax_rate != null ? parseFloat(row.tax_rate) : null,
		budgetImpact: row.budget_impact !== false && row.budget_impact !== 0,
		sequence: row.sequence,
		amount: parseFloat(row.taxable_amount),
		cgst: parseFloat(row.cgst),
		sgst: parseFloat(row.sgst),
		igst: parseFloat(row.igst),
		total: parseFloat(row.total),
	}));
}

module.exports = { toEngineItems, chargeBreakdownToRows, dbRowsToCharges };
