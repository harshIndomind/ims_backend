/**
 * Budget limit + budget impact math (docs/budget-validation/budget-modification.md).
 * Pure and dependency-free apart from money.js, same convention as charge-tax-engine.util.js —
 * the backend is the only place these numbers are computed; the budget form only previews them.
 *
 *   Budget Commitment Limit = Base Amount
 *                           + Tax (only when tax_budget_impact = 'non_recoverable')
 *                           + Additional Cost Provision
 *   Effective Limit         = Commitment Limit + Σ approved revisions (revised_amount)
 *
 *   PO/WO Budget Impact     = Line taxable amount
 *                           + Budget-impacting charges (split pro-rata by line taxable amount)
 *                           + Line/charge tax (only when the budget's tax is non-recoverable)
 *
 * "Grand Total = Budget Impact" is deliberately NOT assumed anywhere here.
 */
const { round2 } = require('./money');

const PROVISION_TYPE = { NONE: 'none', PERCENTAGE: 'percentage', FIXED: 'fixed' };
const TAX_BUDGET_IMPACT = { RECOVERABLE: 'recoverable', NON_RECOVERABLE: 'non_recoverable' };

const num = (v) => {
	const n = parseFloat(v);
	return Number.isFinite(n) ? n : 0;
};

function isTaxBudgetImpacting(taxBudgetImpact) {
	return taxBudgetImpact !== TAX_BUDGET_IMPACT.RECOVERABLE;
}

/**
 * Derives every computed budget money field from the user-entered inputs. Item-wise
 * `amount` is always qty × avg rate (same formula the budget form has always used);
 * value-wise `amount` is entered directly.
 */
function computeBudgetLimits({
	budgetType,
	qty_for_purchase,
	average_rate,
	amount,
	tax_duty_value_percentage,
	provision_type,
	provision_percentage,
	provision_amount,
	tax_budget_impact,
}) {
	const baseAmount = budgetType === 'item-wise' ? round2(num(qty_for_purchase) * num(average_rate)) : round2(num(amount));
	const taxDutyAmount = round2((baseAmount * num(tax_duty_value_percentage)) / 100);

	const provisionType = Object.values(PROVISION_TYPE).includes(provision_type) ? provision_type : PROVISION_TYPE.NONE;
	let provisionAmount = 0;
	let provisionPercentage = null;
	if (provisionType === PROVISION_TYPE.PERCENTAGE) {
		provisionPercentage = num(provision_percentage);
		provisionAmount = round2((baseAmount * provisionPercentage) / 100);
	} else if (provisionType === PROVISION_TYPE.FIXED) {
		provisionAmount = round2(num(provision_amount));
	}

	const taxImpact = tax_budget_impact === TAX_BUDGET_IMPACT.RECOVERABLE ? TAX_BUDGET_IMPACT.RECOVERABLE : TAX_BUDGET_IMPACT.NON_RECOVERABLE;
	const commitmentLimit = round2(baseAmount + (isTaxBudgetImpacting(taxImpact) ? taxDutyAmount : 0) + provisionAmount);

	return {
		amount: baseAmount,
		tax_duty_amount: taxDutyAmount,
		provision_type: provisionType,
		provision_percentage: provisionPercentage,
		provision_amount: provisionAmount,
		tax_budget_impact: taxImpact,
		commitment_limit: commitmentLimit,
	};
}

/** Commitment limit + approved revisions. Falls back to amount + tax for a row never recomputed. */
function effectiveCommitmentLimit(budget) {
	const limit =
		budget.commitment_limit != null
			? num(budget.commitment_limit)
			: num(budget.amount) + num(budget.tax_duty_amount) + num(budget.provision_amount);
	return round2(limit + num(budget.revised_amount));
}

/**
 * How much of its cost-centre allocation a budget draws down: base + tax + provision + approved
 * revisions (tax counted regardless of recoverability — the allocation has always been charged
 * amount + tax_duty_amount, and a revision is new money that must come from somewhere).
 */
function allocationUsage(budget) {
	return round2(
		num(budget.amount) + num(budget.tax_duty_amount) + num(budget.provision_amount) + num(budget.revised_amount),
	);
}

/**
 * Splits one PO/WO's engine output into per-budget impact components.
 *
 * @param {object} totals - calculateDocumentTotals() output (items[i].taxableAmount/taxAmount/cess,
 *   preTaxCharges/postTaxCharges with amount/tax and the caller's `budgetImpact` flag).
 * @param {{budget_id: number|null, factor?: number}[]} lines - one per totals.items[i], in the
 *   same order. `factor` (0..1) scales a line down, e.g. for approved short-closed qty.
 * @returns {Map<number, {taxable, tax, chargeAmount, chargeTax}>}
 */
function computeDocumentBudgetComponents(totals, lines) {
	const items = totals.items || [];
	const charges = [...(totals.preTaxCharges || []), ...(totals.postTaxCharges || [])].filter(
		(c) => c.budgetImpact !== false,
	);
	const chargeAmountTotal = charges.reduce((s, c) => s + num(c.amount), 0);
	const chargeTaxTotal = charges.reduce((s, c) => s + num(c.tax), 0);

	const taxableTotal = items.reduce((s, it) => s + num(it.taxableAmount), 0);
	const byBudget = new Map();

	items.forEach((it, i) => {
		const line = lines[i] || {};
		if (!line.budget_id) return;
		const factor = line.factor == null ? 1 : num(line.factor);
		// Pro-rata by taxable amount (same basis INHERIT_ITEM_TAX uses to spread charge tax);
		// equal split only when there is no taxable base at all to weigh against.
		const share = taxableTotal ? num(it.taxableAmount) / taxableTotal : 1 / items.length;

		const key = Number(line.budget_id);
		const acc = byBudget.get(key) || { taxable: 0, tax: 0, chargeAmount: 0, chargeTax: 0 };
		acc.taxable += num(it.taxableAmount) * factor;
		acc.tax += (num(it.taxAmount) + num(it.cess)) * factor;
		acc.chargeAmount += chargeAmountTotal * share * factor;
		acc.chargeTax += chargeTaxTotal * share * factor;
		byBudget.set(key, acc);
	});

	for (const acc of byBudget.values()) {
		acc.taxable = round2(acc.taxable);
		acc.tax = round2(acc.tax);
		acc.chargeAmount = round2(acc.chargeAmount);
		acc.chargeTax = round2(acc.chargeTax);
	}
	return byBudget;
}

/** Collapses one budget's components into a single impact figure per its tax treatment. */
function budgetImpactOf(components, taxBudgetImpact) {
	const c = components || {};
	const taxPart = isTaxBudgetImpacting(taxBudgetImpact) ? num(c.tax) + num(c.chargeTax) : 0;
	return round2(num(c.taxable) + num(c.chargeAmount) + taxPart);
}

module.exports = {
	PROVISION_TYPE,
	TAX_BUDGET_IMPACT,
	isTaxBudgetImpacting,
	computeBudgetLimits,
	effectiveCommitmentLimit,
	allocationUsage,
	computeDocumentBudgetComponents,
	budgetImpactOf,
};
