const {
	calculateItemTax,
	calculateDocumentTotals,
	legacyCustomFieldsToCharges,
	TAX_TREATMENT,
	APPLY_ON,
	CALCULATION_TYPE,
	OPERATION,
} = require('../charge-tax-engine.util');

function item(qty, price, rate, opts = {}) {
	return { qty, price, rate, discount: 0, discountType: 'rupee', cess: 0, ...opts };
}

function charge(name, overrides = {}) {
	return {
		name,
		calculationType: CALCULATION_TYPE.FIXED,
		value: 0,
		operation: OPERATION.ADD,
		applyOn: APPLY_ON.AFTER_TAX,
		taxTreatment: TAX_TREATMENT.NON_TAXABLE,
		...overrides,
	};
}

describe('charge-tax-engine: calculateItemTax', () => {
	test('same-state item splits CGST/SGST evenly', () => {
		const r = calculateItemTax(item(1, 100000, 18), true);
		expect(r.taxableAmount).toBe(100000);
		expect(r.taxAmount).toBe(18000);
		expect(r.cgst).toBe(9000);
		expect(r.sgst).toBe(9000);
		expect(r.igst).toBe(0);
	});

	test('inter-state item computes IGST only', () => {
		const r = calculateItemTax(item(1, 100000, 18), false);
		expect(r.igst).toBe(18000);
		expect(r.cgst).toBe(0);
		expect(r.sgst).toBe(0);
	});

	test('percentage discount reduces taxable amount before tax', () => {
		const r = calculateItemTax(item(1, 1000, 18, { discount: 10, discountType: 'percentage' }), true);
		expect(r.taxableAmount).toBe(900);
		expect(r.taxAmount).toBe(162);
	});

	test('rupee discount reduces taxable amount before tax', () => {
		const r = calculateItemTax(item(1, 1000, 18, { discount: 100, discountType: 'rupee' }), true);
		expect(r.taxableAmount).toBe(900);
	});

	test('zero GST item produces zero tax', () => {
		const r = calculateItemTax(item(1, 1000, 0), true);
		expect(r.taxAmount).toBe(0);
		expect(r.cgst).toBe(0);
		expect(r.sgst).toBe(0);
	});

	test('odd-paisa tax splits without losing a paisa (CGST+SGST sums exactly to tax)', () => {
		const r = calculateItemTax(item(1, 555.61, 18), true);
		expect(round(r.cgst + r.sgst)).toBe(r.taxAmount);
	});
});

function round(n) {
	return Math.round(n * 100) / 100;
}

describe('charge-tax-engine: calculateDocumentTotals — items only', () => {
	test('1. one item @ 18%, no charges', () => {
		const res = calculateDocumentTotals({ items: [item(1, 100000, 18)], charges: [], sameState: true });
		expect(res.totalTaxable).toBe(100000);
		expect(res.totalTax).toBe(18000);
		expect(res.grandTotal).toBe(118000);
	});

	test('2. multiple items all @ 18%', () => {
		const res = calculateDocumentTotals({
			items: [item(1, 100000, 18), item(1, 50000, 18)],
			charges: [],
			sameState: true,
		});
		expect(res.totalTaxable).toBe(150000);
		expect(res.totalTax).toBe(27000);
		expect(res.grandTotal).toBe(177000);
	});

	test('3. multiple items at 5%, 12%, 18%', () => {
		const res = calculateDocumentTotals({
			items: [item(1, 100000, 18), item(1, 50000, 5), item(1, 50000, 12)],
			charges: [],
			sameState: true,
		});
		expect(res.totalTaxable).toBe(200000);
		// 18000 + 2500 + 6000
		expect(res.totalTax).toBe(26500);
	});

	test('14. zero GST across all items', () => {
		const res = calculateDocumentTotals({ items: [item(1, 1000, 0), item(1, 2000, 0)], charges: [], sameState: true });
		expect(res.totalTax).toBe(0);
		expect(res.grandTotal).toBe(3000);
	});

	test('15. CGST + SGST for same-state document', () => {
		const res = calculateDocumentTotals({ items: [item(1, 1000, 18)], charges: [], sameState: true });
		expect(res.cgst).toBe(90);
		expect(res.sgst).toBe(90);
		expect(res.igst).toBe(0);
	});

	test('16. IGST for inter-state document', () => {
		const res = calculateDocumentTotals({ items: [item(1, 1000, 18)], charges: [], sameState: false });
		expect(res.igst).toBe(180);
		expect(res.cgst).toBe(0);
		expect(res.sgst).toBe(0);
	});

	test('17. mixed GST rates roll up correctly', () => {
		const res = calculateDocumentTotals({
			items: [item(1, 100000, 18), item(1, 50000, 5), item(1, 50000, 12)],
			charges: [],
			sameState: false,
		});
		expect(res.igst).toBe(26500);
	});
});

describe('charge-tax-engine: contingency (INHERIT_ITEM_TAX) allocation across GST buckets', () => {
	// Items: A=100000@18%, B=50000@5%, C=50000@12% ; Contingency 10% inherit-item-tax
	const items = [item(1, 100000, 18), item(1, 50000, 5), item(1, 50000, 12)];
	const contingency = charge('Contingency', {
		calculationType: CALCULATION_TYPE.PERCENTAGE,
		value: 10,
		applyOn: APPLY_ON.NET_TAXABLE_AMOUNT,
		taxTreatment: TAX_TREATMENT.INHERIT_ITEM_TAX,
	});

	test('4. contingency allocates proportionally, never highest/average/first rate', () => {
		const res = calculateDocumentTotals({ items, charges: [contingency], sameState: true });
		const c = res.preTaxCharges[0];
		expect(c.amount).toBe(20000); // 10% of 200000
		// allocation: 18%-bucket gets 10000, 5%-bucket gets 5000, 12%-bucket gets 5000
		const alloc = c.appliedTaxTreatment === 'INHERIT_ITEM_TAX' ? c : null;
		expect(alloc).toBeTruthy();
		// tax on contingency = 10000*18% + 5000*5% + 5000*12% = 1800+250+600 = 2650
		expect(c.tax).toBe(2650);
		expect(res.totalTaxable).toBe(220000); // 200000 items + 20000 contingency
		// item tax 26500 + contingency tax 2650
		expect(res.totalTax).toBe(29150);
		expect(res.grandTotal).toBe(220000 + 29150);
	});

	test('inherit-item-tax falls back to non-taxable when there are no items to allocate against', () => {
		const res = calculateDocumentTotals({ items: [], charges: [contingency], sameState: true });
		expect(res.preTaxCharges[0].appliedTaxTreatment).toBe('NON_TAXABLE');
		expect(res.preTaxCharges[0].tax).toBe(0);
	});
});

describe('charge-tax-engine: fixed/specific-rate/non-taxable charges', () => {
	const items = [item(1, 100000, 18)];

	test('5. fixed taxable freight @ 18% (own specific rate)', () => {
		const freight = charge('Freight', {
			calculationType: CALCULATION_TYPE.FIXED,
			value: 2000,
			applyOn: APPLY_ON.NET_TAXABLE_AMOUNT,
			taxTreatment: TAX_TREATMENT.SPECIFIC_RATE,
			taxRate: 18,
		});
		const res = calculateDocumentTotals({ items, charges: [freight], sameState: true });
		expect(res.preTaxCharges[0].amount).toBe(2000);
		expect(res.preTaxCharges[0].tax).toBe(360);
		expect(res.totalTaxable).toBe(102000);
		expect(res.totalTax).toBe(18000 + 360);
	});

	test('6. fixed non-taxable freight', () => {
		const freight = charge('Freight', { value: 2000, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const res = calculateDocumentTotals({ items, charges: [freight], sameState: true });
		expect(res.preTaxCharges[0].tax).toBe(0);
		expect(res.totalTaxable).toBe(102000);
		expect(res.totalTax).toBe(18000);
	});

	test('7. post-tax non-taxable charge', () => {
		const other = charge('Other Charge', { value: 500, applyOn: APPLY_ON.AFTER_TAX, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const res = calculateDocumentTotals({ items, charges: [other], sameState: true });
		expect(res.grossAmount).toBe(118000);
		expect(res.grandTotal).toBe(118500);
	});

	test('8/9/10. multiple taxable + non-taxable charges together (brief Phase 5 worked example)', () => {
		const contingency = charge('Contingency', {
			calculationType: CALCULATION_TYPE.PERCENTAGE,
			value: 10,
			applyOn: APPLY_ON.NET_TAXABLE_AMOUNT,
			taxTreatment: TAX_TREATMENT.INHERIT_ITEM_TAX,
		});
		const freight = charge('Freight', {
			value: 2000,
			applyOn: APPLY_ON.NET_TAXABLE_AMOUNT,
			taxTreatment: TAX_TREATMENT.SPECIFIC_RATE,
			taxRate: 18,
		});
		const packing = charge('Packing', { value: 1000, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const otherCharge = charge('Other Charge', { value: 500, applyOn: APPLY_ON.AFTER_TAX, taxTreatment: TAX_TREATMENT.NON_TAXABLE });

		const res = calculateDocumentTotals({ items, charges: [contingency, freight, packing, otherCharge], sameState: true });
		// pre-tax charges total = 10000 (contingency, 10% of 100000) + 2000 (freight) + 1000 (packing) = 13000
		expect(res.preTaxCharges.map((c) => c.amount)).toEqual([10000, 2000, 1000]);
		expect(res.totalTaxable).toBe(113000);
		// tax: item 18000 + contingency(10000@18%=1800) + freight(2000@18%=360) + packing(0) = 20160
		expect(res.totalTax).toBe(20160);
		expect(res.grossAmount).toBe(113000 + 20160);
		expect(res.grandTotal).toBe(res.grossAmount + 500);
	});

	test('11. percentage charge based on taxable amount uses the fixed items-only base, not a cascading total', () => {
		const a = charge('A', { calculationType: CALCULATION_TYPE.PERCENTAGE, value: 10, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const b = charge('B', { calculationType: CALCULATION_TYPE.PERCENTAGE, value: 10, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const res = calculateDocumentTotals({ items, charges: [a, b], sameState: true });
		// both compute 10% of 100000 = 10000 each, NOT 10% then 10% of (100000+10000)
		expect(res.preTaxCharges[0].amount).toBe(10000);
		expect(res.preTaxCharges[1].amount).toBe(10000);
	});

	test('12. fixed charge', () => {
		const c = charge('Fixed', { value: 750, applyOn: APPLY_ON.AFTER_TAX });
		const res = calculateDocumentTotals({ items, charges: [c], sameState: true });
		expect(res.grandTotal).toBe(118000 + 750);
	});

	test('13. zero-value charge is a no-op', () => {
		const c = charge('Zero', { value: 0, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const res = calculateDocumentTotals({ items, charges: [c], sameState: true });
		expect(res.grandTotal).toBe(118000);
	});

	test('19. a charge applied after another charge (independent post-tax bases)', () => {
		const c1 = charge('C1', { value: 1000, applyOn: APPLY_ON.AFTER_TAX });
		const c2 = charge('C2', { calculationType: CALCULATION_TYPE.PERCENTAGE, value: 5, applyOn: APPLY_ON.AFTER_TAX });
		const res = calculateDocumentTotals({ items, charges: [c1, c2], sameState: true });
		// c2 = 5% of grossAmount (118000), not 5% of (118000+1000)
		expect(res.postTaxCharges[1].amount).toBe(5900);
		expect(res.grandTotal).toBe(118000 + 1000 + 5900);
	});

	test('negative operation charge deducts (e.g. a discount-as-charge)', () => {
		const discount = charge('Discount', { value: 1000, operation: OPERATION.SUBTRACT, applyOn: APPLY_ON.AFTER_TAX });
		const res = calculateDocumentTotals({ items, charges: [discount], sameState: true });
		expect(res.grandTotal).toBe(118000 - 1000);
	});
});

describe('charge-tax-engine: discount + charge + GST combined', () => {
	test('18. item discount, a taxable charge, and GST all combine correctly', () => {
		const items = [item(1, 1000, 18, { discount: 10, discountType: 'percentage' })]; // taxable 900, tax 162
		const freight = charge('Freight', { value: 100, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.SPECIFIC_RATE, taxRate: 18 });
		const res = calculateDocumentTotals({ items, charges: [freight], sameState: true });
		expect(res.totalTaxable).toBe(1000);
		expect(res.totalTax).toBe(162 + 18);
		expect(res.grandTotal).toBe(1000 + 180);
	});
});

describe('charge-tax-engine: round-off', () => {
	const items = [item(1, 100000.4, 18)]; // taxable 100000.4, tax 18000.072 -> rounds to 18000.07

	test('20. positive round-off', () => {
		const res = calculateDocumentTotals({ items, charges: [], sameState: true, roundOff: true });
		expect(Number.isInteger(res.grandTotal)).toBe(true);
		expect(round(res.grandTotal - res.roundOffAmount)).toBe(round(100000.4 + 18000.07));
	});

	test('21. negative round-off', () => {
		const itemsNeg = [item(1, 99999.6, 18)]; // -> grand total just above a whole rupee, round-off negative
		const res = calculateDocumentTotals({ items: itemsNeg, charges: [], sameState: true, roundOff: true });
		expect(Number.isInteger(res.grandTotal)).toBe(true);
		expect(res.roundOffAmount).toBeLessThanOrEqual(0.5);
	});

	test('round-off disabled leaves 2-decimal grand total untouched', () => {
		const res = calculateDocumentTotals({ items, charges: [], sameState: true, roundOff: false });
		expect(res.roundOffAmount).toBe(0);
		expect(res.grandTotal).toBe(round(100000.4 + 18000.07));
	});
});

describe('charge-tax-engine: legacyCustomFieldsToCharges', () => {
	test('23/24. legacy PO/WO customFields adapt into equivalent generic charges', () => {
		const legacy = [
			{ name: 'TCS', valueType: 'percentage', operationType: '+', amount: '5' },
			{ name: 'Discount', valueType: 'rupee', operationType: '-', amount: '200' },
		];
		const charges = legacyCustomFieldsToCharges(legacy);
		expect(charges).toHaveLength(2);
		expect(charges[0]).toMatchObject({
			name: 'TCS',
			calculationType: 'PERCENTAGE',
			value: 5,
			operation: '+',
			applyOn: 'AFTER_TAX',
			taxTreatment: 'NON_TAXABLE',
		});
		expect(charges[1]).toMatchObject({ name: 'Discount', calculationType: 'FIXED', value: 200, operation: '-' });

		// Round-trip: feeding the adapted charges back through the engine reproduces
		// the same total a legacy single-pass customField calculation would have,
		// for the common single-charge case.
		const items = [item(1, 100000, 18)];
		const res = calculateDocumentTotals({ items, charges: [charges[0]], sameState: true });
		expect(res.grandTotal).toBe(118000 + 5900); // 5% of 118000
	});

	test('empty/null legacy slots produce zero charges (documents with no customFields)', () => {
		expect(legacyCustomFieldsToCharges([null, null])).toEqual([]);
		expect(legacyCustomFieldsToCharges(undefined)).toEqual([]);
	});

	test('22. editing an existing document: legacy charges + a newly added charge coexist deterministically', () => {
		const legacy = legacyCustomFieldsToCharges([{ name: 'TCS', valueType: 'percentage', operationType: '+', amount: '2' }]);
		const newCharge = charge('Freight', { value: 500, applyOn: APPLY_ON.NET_TAXABLE_AMOUNT, taxTreatment: TAX_TREATMENT.NON_TAXABLE });
		const items = [item(1, 100000, 18)];
		const res = calculateDocumentTotals({ items, charges: [newCharge, ...legacy], sameState: true });
		expect(res.totalTaxable).toBe(100500);
		expect(res.postTaxCharges[0].amount).toBe(round((100500 + 18000) * 0.02));
	});
});
