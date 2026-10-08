const mysql = require('mysql2/promise');

(async () => {
    const db = process.env.DB_DATABASE;
    if (!db || /scm/i.test(db)) {
        console.error(`Refusing to run against "${db}"`);
        process.exit(1);
    }
    const c = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: db,
    });
    const [cmd, list] = process.argv.slice(2);
    if (cmd === 'hide' && list) {
        const pats = list.split(',').map((s) => s.trim()).filter(Boolean);
        const cond = pats.map(() => 'slug LIKE ?').join(' OR ');
        const [r] = await c.query(`UPDATE Menus SET isActive = 0 WHERE ${cond}`, pats);
        console.log('Hidden:', r.affectedRows);
    }
    const [rows] = await c.query(
        'SELECT id, parentId, menuName, slug, url FROM Menus WHERE isActive = 1 ORDER BY id',
    );
    console.table(rows);
    await c.end();
})();
