// import_lvr_2023.js
// 把 SQLite lvr_land 2023 年資料 APPEND 到 Neon Project B (spacelog-lvr)
// 不清空現有的 2024+ 資料，只新增 2023（ON CONFLICT DO NOTHING）

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const path = require('path');

const DIRECT_LVR = 'postgresql://neondb_owner:npg_xKZswy8P2ipb@ep-fancy-dew-aotd8fk2.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_LVR, max: 2 });

function toTsv(val) {
  if (val === null || val === undefined) return '\\N';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function main() {
  const YEAR_FROM = '2023-01-01';
  const YEAR_TO   = '2024-01-01';

  // ── 1. 確認 SQLite 來源筆數 ──
  const srcCount = db.prepare(
    "SELECT COUNT(*) as n FROM lvr_land WHERE tx_date_iso >= ? AND tx_date_iso < ?"
  ).get(YEAR_FROM, YEAR_TO);
  console.log(`SQLite 2023 筆數：${Number(srcCount.n).toLocaleString()}`);

  // ── 2. 確認 Neon 沒有 2023 資料（避免重複）──
  const existing = await pool.query(
    "SELECT COUNT(*) as n FROM lvr_land WHERE tx_date_iso >= $1 AND tx_date_iso < $2",
    [YEAR_FROM, YEAR_TO]
  );
  console.log(`Neon 已有 2023 筆數：${Number(existing.rows[0].n).toLocaleString()}`);

  if (Number(existing.rows[0].n) > 0) {
    console.log('⚠️  Neon 已有 2023 資料，請確認是否要重跑（目前直接跳過重複）');
  }

  // ── 3. 確認 Neon DB 剩餘空間 ──
  const sz = await pool.query(`SELECT pg_database_size(current_database()) as b`);
  const usedMB = Math.round(Number(sz.rows[0].b) / 1024 / 1024);
  console.log(`Neon 現有用量：${usedMB} MB / 512 MB（剩餘 ${512 - usedMB} MB）\n`);

  // ── 4. 取 SQLite 欄位順序 ──
  const cols = db.prepare('PRAGMA table_info("lvr_land")').all().map(r => r.name);
  const colSql = cols.map(c => `"${c}"`).join(', ');

  const total = Number(srcCount.n);

  // ── 5. COPY via temp table → INSERT ON CONFLICT DO NOTHING ──
  // Step A：建臨時表
  const client = await pool.connect();
  try {
    console.log('建立暫存表 lvr_land_tmp_2023...');
    await client.query('DROP TABLE IF EXISTS lvr_land_tmp_2023');
    await client.query(`CREATE TEMP TABLE lvr_land_tmp_2023 (LIKE lvr_land INCLUDING ALL)`);

    // Step B：COPY 到暫存表
    console.log(`開始 COPY ${total.toLocaleString()} 筆到暫存表...`);
    const stream = client.query(
      copyFrom(`COPY lvr_land_tmp_2023 (${colSql}) FROM STDIN WITH (FORMAT TEXT, DELIMITER '\t', NULL '\\N')`)
    );

    const querySql = `SELECT * FROM lvr_land WHERE tx_date_iso >= ? AND tx_date_iso < ? ORDER BY id`;
    const rows = db.prepare(querySql).iterate(YEAR_FROM, YEAR_TO);

    let done = 0;
    for (const row of rows) {
      const line = cols.map(c => toTsv(row[c])).join('\t') + '\n';
      const ok = stream.write(line);
      if (!ok) await new Promise(r => stream.once('drain', r));
      done++;
      if (done % 50000 === 0)
        process.stdout.write(`\r  COPY ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done / total * 100)}%)`);
    }

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end();
    });
    console.log(`\r  COPY 完成：${done.toLocaleString()} 筆`);

    // Step C：INSERT ON CONFLICT DO NOTHING
    console.log('\n INSERT INTO lvr_land (ON CONFLICT DO NOTHING)...');
    const insertResult = await client.query(`
      INSERT INTO lvr_land (${colSql})
      SELECT ${colSql} FROM lvr_land_tmp_2023
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`  ✅ 新增：${insertResult.rowCount?.toLocaleString() ?? '?'} 筆`);

    // Step D：清理暫存表
    await client.query('DROP TABLE IF EXISTS lvr_land_tmp_2023');
  } finally {
    client.release();
  }

  // ── 6. 最終狀態 ──
  const finalSz = await pool.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) as s, pg_database_size(current_database()) as b`
  );
  const finalMB = Math.round(Number(finalSz.rows[0].b) / 1024 / 1024);
  console.log(`\nProject B 最終用量：${finalSz.rows[0].s} (${finalMB} MB / 512 MB)`);

  const finalCount = await pool.query(`
    SELECT substr(tx_date_iso,1,4) as yr, COUNT(*) as n
    FROM lvr_land GROUP BY yr ORDER BY yr
  `);
  console.log('\nlvr_land 各年份筆數：');
  finalCount.rows.forEach(r => console.log(` ${r.yr}: ${Number(r.n).toLocaleString()}`));
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
