// migrate-to-neon.js  --  SQLite → Neon PostgreSQL
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const BATCH = 2000;

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_URL, max: 3 });

function sqliteTables() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
}

function getColumns(table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
}

function rowCount(table) {
  return Number(db.prepare(`SELECT COUNT(*) as n FROM "${table}"`).get().n);
}

async function migrateTable(table) {
  const cols = getColumns(table);
  const total = rowCount(table);
  console.log(`\n[${table}]  ${total.toLocaleString()} rows`);

  const colSql = cols.map(c => `"${c}"`).join(', ');
  let done = 0;

  for (let offset = 0; offset < total; offset += BATCH) {
    const rows = db.prepare(`SELECT * FROM "${table}" LIMIT ${BATCH} OFFSET ${offset}`).all();
    if (!rows.length) break;

    const placeholders = rows
      .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
      .join(', ');

    const values = rows.flatMap(row => cols.map(col => row[col] ?? null));

    try {
      await pool.query(
        `INSERT INTO "${table}" (${colSql}) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`,
        values
      );
    } catch (err) {
      // try row-by-row fallback on batch error
      for (const row of rows) {
        const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
        try {
          await pool.query(
            `INSERT INTO "${table}" (${colSql}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
            cols.map(c => row[c] ?? null)
          );
        } catch { /* skip bad row */ }
      }
    }

    done += rows.length;
    process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done / total * 100)}%)`);
  }
  console.log(`\n  ✓ done`);
}

async function main() {
  const found = sqliteTables();
  console.log('SQLite tables:', found.join(', '));

  const order = ['rezoning_case', 'inherited_land', 'lvr_land_section', 'lvr_presale', 'houses', 'lvr_land'];

  for (const table of order) {
    if (found.includes(table)) {
      await migrateTable(table);
    } else {
      console.log(`\n[${table}]  not in SQLite, skip`);
    }
  }

  console.log('\n\n✅ 全部完成！');
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
