// free-space-and-insert-houses.js
// 刪除 2026-04-01 以前的過期法拍案，VACUUM 後插入新資料
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const CUTOFF = '2026-04-01'; // 開標日早於此日期的視為過期

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_URL, max: 1 });

function getColumns() {
  return db.prepare(`PRAGMA table_info("houses")`).all().map(r => r.name);
}

async function main() {
  // 先看目前狀況
  const before = await pool.query(
    `SELECT COUNT(*) as n FROM houses WHERE auction_date < $1`, [CUTOFF]
  );
  console.log(`Neon 中 auction_date < ${CUTOFF} 的過期記錄：${before.rows[0].n} 筆`);

  // 刪除過期記錄
  const del = await pool.query(
    `DELETE FROM houses WHERE auction_date < $1`, [CUTOFF]
  );
  console.log(`已刪除 ${del.rowCount} 筆過期記錄`);

  // VACUUM 回收空間
  console.log('VACUUM houses...');
  await pool.query('VACUUM houses');
  console.log('VACUUM 完成');

  // 查目前大小
  const sizeRes = await pool.query(`
    SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total
    FROM pg_class WHERE relkind='r'
  `);
  console.log(`Neon 目前用量: ${sizeRes.rows[0].total}`);

  // 取 Neon 現有 house ids
  console.log('\n取得 Neon 現有 house ids...');
  const neonIds = new Set();
  let offset = 0;
  while (true) {
    const res = await pool.query(`SELECT id FROM houses ORDER BY id LIMIT 5000 OFFSET $1`, [offset]);
    if (!res.rows.length) break;
    res.rows.forEach(r => neonIds.add(r.id));
    offset += res.rows.length;
  }
  console.log(`Neon houses: ${neonIds.size} 筆`);

  // 找需插入的記錄（SQLite 有但 Neon 沒有）
  const allSqlite = db.prepare(`SELECT * FROM houses`).all();
  const newRows = allSqlite.filter(r => !neonIds.has(r.id));
  console.log(`SQLite ${allSqlite.length} 筆，需插入 ${newRows.length} 筆`);

  if (!newRows.length) {
    console.log('無新資料需插入');
    return;
  }

  // 插入新資料
  const cols = getColumns();
  const colSql = cols.map(c => `"${c}"`).join(', ');
  let done = 0, failed = 0;
  for (const row of newRows) {
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await pool.query(
        `INSERT INTO "houses" (${colSql}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
        cols.map(c => row[c] ?? null)
      );
      done++;
    } catch (e) {
      failed++;
      console.error(`  ❌ ${row.id}: ${e.message}`);
      if (e.message.includes('project size limit')) break;
    }
  }
  console.log(`\n插入完成：${done} 筆成功，${failed} 筆失敗`);

  // 最終確認
  const final = await pool.query(`SELECT COUNT(*) as n FROM houses`);
  console.log(`Neon houses 最終筆數：${final.rows[0].n}`);
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
