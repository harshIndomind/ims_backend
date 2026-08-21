'use strict';

const money = require('../money');

describe('money', () => {
	test('lte avoids classic float false negatives', () => {
		// 0.1 + 0.2 > 0.3 in raw JS float math — this must not be treated as "exceeds".
		expect(money.lte(0.1 + 0.2, 0.3)).toBe(true);
	});

	test('gt is the strict inverse for equal decimal amounts', () => {
		expect(money.gt(100.0, 100.0)).toBe(false);
		expect(money.gt(100.01, 100.0)).toBe(true);
	});

	test('sum rounds to the nearest paisa across many small amounts', () => {
		const amounts = Array(10).fill(0.1);
		expect(money.sum(amounts)).toBe(1);
	});

	test('round2 rounds to 2 decimals and accepts numeric strings', () => {
		expect(money.round2('123.456')).toBe(123.46);
		expect(money.round2(99.999)).toBe(100);
	});
});
