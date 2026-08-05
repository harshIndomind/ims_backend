// Indian financial year: Apr 1 - Mar 31, e.g. Aug 2026 -> "26-27", Feb 2027 -> "26-27".
function getFiscalYear(date = new Date()) {
	const month = date.getMonth() + 1; // 1-12
	const year = date.getFullYear();
	const startYear = month >= 4 ? year : year - 1;
	const startYearShort = String(startYear % 100).padStart(2, '0');
	const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
	return `${startYearShort}-${endYearShort}`;
}

module.exports = { getFiscalYear };
