// sync-houses-to-neon.js  --  SQLite houses → Neon (UPSERT)
// 用 ON CONFLICT DO UPDATE，確保拍次更新、底價調整等都能同步
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const BATCH = 500;

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_URL, max: 3 });

function getColumns(table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
}

function rowCount(table) {
  return Number(db.prepare(`SELECT COUNT(*) as n FROM "${table}"`).get().n);
}

async function syncHouses() {
  const cols = getColumns('houses');
  const total = rowCount('houses');
  console.log(`\n[houses]  ${total.toLocaleString()} rows in SQLite`);

  // 非 id 欄位，用於 DO UPDATE SET
  const updateCols = cols.filter(c => c !== 'id');
  const colSql = cols.map(c => `"${c}"`).join(', ');
  const updateSql = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

  let done = 0;
  let inserted = 0;
  let updated = 0;

  for (let offset = 0; offset < total; offset += BATCH) {
    const rows = db.prepare(`SELECT * FROM "houses" LIMIT ${BATCH} OFFSET ${offset}`).all();
    if (!rows.length) break;

    for (const row of rows) {
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      const vals = cols.map(c => row[c] ?? null);
      try {
        const res = await pool.query(
          `INSERT INTO "houses" (${colSql}) VALUES (${ph})
           ON CONFLICT (id) DO UPDATE SET ${updateSql}`,
          vals
        );
        // pgRowCount 1 = inserted (or updated if row changed)
      } catch (err) {
        console.error(`\n  跳過錯誤 id=${row.id}:`, err.message);
      }
    }

    done += rows.length;
    process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done / total * 100)}%)`);
  }

  console.log(`\n  ✓ 完成，共處理 ${done.toLocaleString()} 筆`);
}

async function main() {
  await syncHouses();
  console.log('\n✅ houses 同步到 Neon 完成！');
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
