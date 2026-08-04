'use strict';

const SHORT_NAME_MAX_LENGTH = 20;

// Mirrors the initials-based generator used on the frontend (unit-form.tsx)
// so backfilled codes look the same as freshly auto-generated ones.
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

function buildUniqueShortName(baseCode, usedCodes) {
	const fallback = baseCode || 'UNIT';
	let candidate = fallback;
	let suffix = 0;

	while (usedCodes.has(candidate.toUpperCase())) {
		suffix += 1;
		const suffixStr = String(suffix).padStart(3, '0');
		candidate = `${fallback.slice(0, SHORT_NAME_MAX_LENGTH - suffixStr.length)}${suffixStr}`;
	}

	usedCodes.add(candidate.toUpperCase());
	return candidate;
}

module.exports = {
	async up(queryInterface, Sequelize) {
		const rows = await queryInterface.sequelize.query(
			'SELECT id, unit_name, unitName, unit_short_name FROM MasterUnits',
			{ type: Sequelize.QueryTypes.SELECT },
		);

		const usedCodes = new Set(
			rows.filter((r) => r.unit_short_name).map((r) => r.unit_short_name.toUpperCase()),
		);

		for (const row of rows) {
			if (row.unit_short_name) continue;

			const source = row.unit_name || row.unitName || `UNIT${row.id}`;
			const base = generateBaseShortName(source) || `UNIT${row.id}`;
			const shortName = buildUniqueShortName(base, usedCodes);

			await queryInterface.sequelize.query(
				'UPDATE MasterUnits SET unit_short_name = :shortName WHERE id = :id',
				{ replacements: { shortName, id: row.id } },
			);
		}

		await queryInterface.changeColumn('MasterUnits', 'unit_short_name', {
			type: Sequelize.STRING(SHORT_NAME_MAX_LENGTH),
			allowNull: false,
		});

		await queryInterface.addIndex('MasterUnits', ['unit_short_name'], {
			name: 'idx_master_units_short_name_unique',
			unique: true,
		});
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeIndex('MasterUnits', 'idx_master_units_short_name_unique');
		await queryInterface.changeColumn('MasterUnits', 'unit_short_name', {
			type: Sequelize.STRING(255),
			allowNull: true,
		});
	},
};
