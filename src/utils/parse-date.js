const { format } = require('date-fns/format');

function parseDate(d) {
	const [day, month, year] = d.split('/').map(Number);
	console.log([day, month, year]);
	return new Date(year, month - 1, day); // month is 0-based
}

module.exports = parseDate;
