'use strict';

const { MasterUnit } = require('../models');

const SHORT_NAME_MAX_LENGTH = 20;
const SHORT_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

// Initials of each word in the unit name, e.g. "Triple A Construction Pvt Ltd" -> "TACPL".
function generateBaseShortName(name) {
	if (!name) return '';
	const words = name
		.trim()
		.split(/\s+/)
		.map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
		.filter(Boolean);

	return words
		.map((word) => word[0].toUpperCase())
		.join('')
		.slice(0, SHORT_NAME_MAX_LENGTH);
}

function buildUniqueCandidate(base, usedCodes) {
	let candidate = base;
	let suffix = 0;

	while (usedCodes.has(candidate.toUpperCase())) {
		suffix += 1;
		const suffixStr = String(suffix).padStart(3, '0');
		candidate = `${base.slice(0, SHORT_NAME_MAX_LENGTH - suffixStr.length)}${suffixStr}`;
	}

	usedCodes.add(candidate.toUpperCase());
	return candidate;
}

async function fetchExistingShortNameSet() {
	const rows = await MasterUnit.findAll({ attributes: ['unit_short_name'] });
	return new Set(rows.map((r) => r.unit_short_name?.toUpperCase()).filter(Boolean));
}

// Used for units synced in from HRMS, which never carry a short name of their own —
// SCM owns unit_short_name locally, so a fresh sync must mint one to satisfy the
// NOT NULL/unique DB constraint before the row can be inserted.
async function generateUniqueUnitShortName(name) {
	const usedCodes = await fetchExistingShortNameSet();
	const base = generateBaseShortName(name) || 'UNIT';
	return buildUniqueCandidate(base, usedCodes);
}

// Batch variant: fetches existing codes once and dedupes in-memory against both
// the DB and the other names in this same batch, avoiding collisions between
// sibling rows that share initials (e.g. two new units both generating "ABC").
async function generateUniqueUnitShortNames(names) {
	const usedCodes = await fetchExistingShortNameSet();
	return names.map((name) => buildUniqueCandidate(generateBaseShortName(name) || 'UNIT', usedCodes));
}

module.exports = {
	SHORT_NAME_MAX_LENGTH,
	SHORT_NAME_REGEX,
	generateBaseShortName,
	generateUniqueUnitShortName,
	generateUniqueUnitShortNames,
};
