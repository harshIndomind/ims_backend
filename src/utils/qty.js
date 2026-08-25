/**
 * Rounds a quantity to a fixed precision before persisting to IndentItem's
 * DOUBLE columns (qty_issued, qty_for_purchase_order, balance_indent_qty, ...),
 * which have no DB-side rounding safety net. Guards against float noise
 * coming back from VCP's UOM conversion (e.g. 8.99999964 instead of 9) —
 * see uomConversion.js/product.service.js in vcp-backend for the root fix.
 */
function roundQty(value, precision = 6) {
	const factor = 10 ** precision;
	return Math.round((parseFloat(value) || 0) * factor) / factor;
}

module.exports = { roundQty };
