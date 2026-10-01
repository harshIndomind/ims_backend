const {
	computeBudgetLimits,
	effectiveCommitmentLimit,
	allocationUsage,
	computeDocumentBudgetComponents,
	budgetImpactOf,
} = require('../budget-limit.util');

describe('computeBudgetLimits', () => {
	it('item-wise: amount = qty × avg rate, tax on base, no provision by default', () => {
		const r = computeBudgetLimits({
			budgetType: 'item-wise',
			qty_for_purchase: 10,
			average_rate: 50000,
			amount: 1, // ignored for item-wise — always recomputed
			tax_duty_value_percentage: 18,
		});
		expect(r.amount).toBe(500000);
		expect(r.tax_duty_amount).toBe(90000);
		expect(r.provision_type).toBe('none');
		expect(r.provision_amount).toBe(0);
		expect(r.tax_budget_impact).toBe('non_recoverable');
		expect(r.commitment_limit).toBe(590000);
	});

	it('percentage provision is computed on the base amount', () => {
		const r = computeBudgetLimits({
			budgetType: 'value-wise',
			amount: 500000,
			tax_duty_value_percentage: 0,
			provision_type: 'percentage',
			provision_percentage: 5,
		});
		expect(r.provision_amount).toBe(25000);
		expect(r.commitment_limit).toBe(525000);
	});

	it('fixed provision ignores any stray percentage', () => {
		const r = computeBudgetLimits({
			budgetType: 'value-wise',
			amount: 1000000,
			provision_type: 'fixed',
			provision_amount: 50000,
			provision_percentage: 99,
		});
		expect(r.provision_percentage).toBeNull();
		expect(r.provision_amount).toBe(50000);
		expect(r.commitment_limit).toBe(1050000);
	});

	it('recoverable tax is kept on record but excluded from the commitment limit', () => {
		const r = computeBudgetLimits({
			budgetType: 'item-wise',
			qty_for_purchase: 10,
			average_rate: 50000,
			tax_duty_value_percentage: 18,
			provision_type: 'percentage',
			provision_percentage: 5,
			tax_budget_impact: 'recoverable',
		});
		expect(r.tax_duty_amount).toBe(90000);
		expect(r.commitment_limit).toBe(525000);
	});

	it('provision "none" zeroes any client-sent provision amount', () => {
		const r = computeBudgetLimits({ budgetType: 'value-wise', amount: 100, provision_type: 'none', provision_amount: 999 });
		expect(r.provision_amount).toBe(0);
		expect(r.commitment_limit).toBe(100);
	});
});

describe('effectiveCommitmentLimit / allocationUsage', () => {
	it('adds approved revisions on top of the commitment limit', () => {
		expect(effectiveCommitmentLimit({ commitment_limit: 1050000, revised_amount: 10000 })).toBe(1060000);
	});

	it('falls back to amount + tax + provision for a row with no stored limit', () => {
		expect(effectiveCommitmentLimit({ amount: 100, tax_duty_amount: 18, provision_amount: 5, revised_amount: 0 })).toBe(123);
	});

	it('allocation usage counts base + tax + provision + revisions regardless of tax treatment', () => {
		expect(
			allocationUsage({ amount: 500000, tax_duty_amount: 90000, provision_amount: 25000, revised_amount: 10000, tax_budget_impact: 'recoverable' }),
		).toBe(625000);
	});
});

describe('computeDocumentBudgetComponents + budgetImpactOf', () => {
	// Spec example: Items 5,00,000 + Freight 8,000 + Transportation 5,000 = 5,13,000 impact.
	const specTotals = {
		items: [{ taxableAmount: 500000, taxAmount: 90000, cess: 0 }],
		preTaxCharges: [],
		postTaxCharges: [
			{ name: 'Freight', amount: 8000, tax: 0 },
			{ name: 'Transportation', amount: 5000, tax: 0 },
		],
	};

	it('items + budget-impacting charges, recoverable GST excluded', () => {
		const c = computeDocumentBudgetComponents(specTotals, [{ budget_id: 1 }]);
		expect(c.get(1)).toEqual({ taxable: 500000, tax: 90000, chargeAmount: 13000, chargeTax: 0 });
		expect(budgetImpactOf(c.get(1), 'recoverable')).toBe(513000);
	});

	it('non-recoverable tax is included in the impact', () => {
		const c = computeDocumentBudgetComponents(specTotals, [{ budget_id: 1 }]);
		expect(budgetImpactOf(c.get(1), 'non_recoverable')).toBe(603000);
	});

	it('a charge flagged budgetImpact=false never counts', () => {
		const totals = {
			...specTotals,
			postTaxCharges: [
				{ name: 'Freight', amount: 8000, tax: 0 },
				{ name: 'Insurance (vendor-borne)', amount: 5000, tax: 0, budgetImpact: false },
			],
		};
		const c = computeDocumentBudgetComponents(totals, [{ budget_id: 1 }]);
		expect(budgetImpactOf(c.get(1), 'recoverable')).toBe(508000);
	});

	it('splits charges pro-rata by taxable amount across budgets; unbudgeted lines absorb their share', () => {
		const totals = {
			items: [
				{ taxableAmount: 600, taxAmount: 0, cess: 0 },
				{ taxableAmount: 300, taxAmount: 0, cess: 0 },
				{ taxableAmount: 100, taxAmount: 0, cess: 0 },
			],
			preTaxCharges: [{ name: 'Packing', amount: 100, tax: 18 }],
			postTaxCharges: [],
		};
		const c = computeDocumentBudgetComponents(totals, [{ budget_id: 1 }, { budget_id: 2 }, { budget_id: null }]);
		expect(c.get(1)).toEqual({ taxable: 600, tax: 0, chargeAmount: 60, chargeTax: 10.8 });
		expect(c.get(2)).toEqual({ taxable: 300, tax: 0, chargeAmount: 30, chargeTax: 5.4 });
		expect(c.size).toBe(2);
	});

	it('discount (negative) charges reduce the impact', () => {
		const totals = {
			items: [{ taxableAmount: 1000, taxAmount: 0, cess: 0 }],
			preTaxCharges: [{ name: 'Discount', amount: -50, tax: 0 }],
			postTaxCharges: [],
		};
		const c = computeDocumentBudgetComponents(totals, [{ budget_id: 1 }]);
		expect(budgetImpactOf(c.get(1), 'recoverable')).toBe(950);
	});

	it('scales a line (and its charge share) by its active-qty factor', () => {
		const totals = {
			items: [{ taxableAmount: 1000, taxAmount: 180, cess: 0 }],
			preTaxCharges: [{ name: 'Freight', amount: 100, tax: 0 }],
			postTaxCharges: [],
		};
		const c = computeDocumentBudgetComponents(totals, [{ budget_id: 1, factor: 0.5 }]);
		expect(c.get(1)).toEqual({ taxable: 500, tax: 90, chargeAmount: 50, chargeTax: 0 });
	});
});
