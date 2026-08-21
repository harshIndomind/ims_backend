/**
 * Decimal-safe helpers for money math on DECIMAL(15,2) columns.
 *
 * Plain `a + b > c` on JS numbers derived from DB decimals is prone to
 * float artifacts (0.1 + 0.2 !== 0.3), which is why older code in this
 * module compared with a hard-coded `+0.005` epsilon. These helpers instead
 * round to the nearest paisa via integer cents, which is exact for the
 * amounts this module deals with (no sub-paisa precision is ever needed).
 */

function toPaise(amount) {
	return Math.round((parseFloat(amount) || 0) * 100);
}

function round2(amount) {
	return toPaise(amount) / 100;
}

/** a <= b, compared at paisa precision (avoids float false negatives). */
function lte(a, b) {
	return toPaise(a) <= toPaise(b);
}

/** a > b, compared at paisa precision. */
function gt(a, b) {
	return toPaise(a) > toPaise(b);
}

function sum(amounts) {
	return round2(amounts.reduce((acc, a) => acc + (parseFloat(a) || 0), 0));
}

module.exports = { toPaise, round2, lte, gt, sum };
