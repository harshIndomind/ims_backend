const mysql = require('mysql2/promise');

const SOURCE_DB = process.env.SOURCE_DB || 'scm_tg_uat_db';
const TARGET_DB = process.env.DB_DATABASE;

// Config/reference tables whose DATA is copied. Transactional tables stay empty.
const DATA_TABLES = [
	/^SequelizeMeta$/i, /^Menus$/i, /^Permissions$/i, /^Roles$/i,
	/^role_permissions$/i, /^user_roles$/i, /^Users$/i, /^organizations$/i,
	/^OrganizationBankDetails$/i, /^departments$/i, /^sub_departments$/i,
	/^designations$/i, /^cost_centers$/i, /^countries$/i, /^states$/i,
	/^workflow_(definitions?|stages?)/i,
];

// SCM-only sidebar entries to hide in IMS
const HIDE_SLUGS = [
	'rate-contract', 'purchase-order', 'work-order', 'payment-requisition',
	'transporters', 'terms-conditions', 'terms-category',
];
const HIDE_LIKE = ['%grn%', '%goods-receipt%', '%short-close%', '%purchase-invoice%', '%tds%'];

(async () => {
	if (!TARGET_DB || TARGET_DB === SOURCE_DB) {
		console.error(`Refusing to run: target "${TARGET_DB}" must be set and differ from source "${SOURCE_DB}".`);
		process.exit(1);
	}
	const conn = await mysql.createConnection({
		host: process.env.DB_HOST,
		user: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
	});
	const id = (s) => conn.escapeId(s);
	console.log(`Source (read only): ${SOURCE_DB}\nTarget (rebuilt):   ${TARGET_DB}\n`);

	await conn.query('SET FOREIGN_KEY_CHECKS=0');

	// 1. Empty the target of any half-migrated tables
	const [existing] = await conn.query(`SHOW TABLES FROM ${id(TARGET_DB)}`);
	for (const row of existing) {
		await conn.query(`DROP TABLE IF EXISTS ${id(TARGET_DB)}.${id(Object.values(row)[0])}`);
	}

	// 2. Recreate every table structure from the source
	const [src] = await conn.query(`SHOW FULL TABLES FROM ${id(SOURCE_DB)}`);
	const tables = src.filter((r) => r.Table_type === 'BASE TABLE').map((r) => Object.values(r)[0]);
	await conn.query(`USE ${id(TARGET_DB)}`);
	for (const t of tables) {
		const [[r]] = await conn.query(`SHOW CREATE TABLE ${id(SOURCE_DB)}.${id(t)}`);
		await conn.query(r['Create Table']);
	}
	console.log(`Created ${tables.length} tables.`);

	// 3. Copy reference data
	for (const t of tables.filter((n) => DATA_TABLES.some((re) => re.test(n)))) {
		const [res] = await conn.query(`INSERT INTO ${id(TARGET_DB)}.${id(t)} SELECT * FROM ${id(SOURCE_DB)}.${id(t)}`);
		console.log(`  data copied: ${t} (${res.affectedRows} rows)`);
	}

	// 4. Hide SCM-only menus
	const conds = [`slug IN (${HIDE_SLUGS.map((s) => conn.escape(s)).join(',')})`]
		.concat(HIDE_LIKE.map((l) => `slug LIKE ${conn.escape(l)}`)).join(' OR ');
	const [hid] = await conn.query(`UPDATE ${id(TARGET_DB)}.Menus SET isActive = 0 WHERE ${conds}`);
	console.log(`\nHid ${hid.affectedRows} SCM menus. Still active:`);
	const [active] = await conn.query(`SELECT id, menuName, slug FROM ${id(TARGET_DB)}.Menus WHERE isActive = 1 ORDER BY id`);
	console.table(active);

	await conn.query('SET FOREIGN_KEY_CHECKS=1');
	await conn.end();
	console.log('\nAll tables:\n' + tables.join('\n'));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });