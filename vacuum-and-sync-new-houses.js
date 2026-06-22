// vacuum-and-sync-new-houses.js
// 1. VACUUM 所有表回收 dead tuple 空間
// 2. 找出 SQLite 有但 Neon 沒有的新 house 記錄
// 3. 只插入差異（不 DO UPDATE，避免 MVCC 膨脹）
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_URL, max: 1 });

function getColumns() {
  return db.prepare(`PRAGMA table_info("houses")`).all().map(r => r.name);
}

async function main() {
  // Step 1: VACUUM 回收空間
  console.log('Step 1: VACUUM all tables...');
  for (const table of ['houses', 'community_names', 'lvr_presale', 'lvr_land', 'inherited_land', 'rezoning_case']) {
    try {
      await pool.query(`VACUUM ${table}`);
      console.log(`  ✓ VACUUM ${table}`);
    } catch (e) {
      console.log(`  - skip ${table}: ${e.message}`);
    }
  }

  // Step 2: 查目前 Neon 有哪些 house id
  console.log('\nStep 2: 取得 Neon 現有 house ids...');
  const neonIds = new Set();
  let offset = 0;
  while (true) {
    const res = await pool.query(`SELECT id FROM houses ORDER BY id LIMIT 5000 OFFSET $1`, [offset]);
    if (!res.rows.length) break;
    res.rows.forEach(r => neonIds.add(r.id));
    offset += res.rows.length;
    process.stdout.write(`\r  Neon 已有 ${neonIds.size} 筆...`);
  }
  console.log(`\n  Neon houses: ${neonIds.size} 筆`);

  // Step 3: 找 SQLite 有但 Neon 沒有的
  const allSqlite = db.prepare(`SELECT * FROM houses`).all();
  const newRows = allSqlite.filter(r => !neonIds.has(r.id));
  console.log(`\nStep 3: SQLite ${allSqlite.length} 筆，新增 ${newRows.length} 筆需插入`);

  if (newRows.length === 0) {
    console.log('沒有新資料需要插入。');
    return;
  }

  // Step 4: 查 Neon 剩餘空間
  const sizeRes = await pool.query(`
    SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total
    FROM pg_class WHERE relkind='r'
  `);
  console.log(`\nNeon 目前用量: ${sizeRes.rows[0].total}`);

  // Step 5: 插入新資料
  const cols = getColumns();
  const colSql = cols.map(c => `"${c}"`).join(', ');
  console.log(`\nStep 4: 插入 ${newRows.length} 筆新 houses...`);
  let done = 0;
  let failed = 0;
  for (const row of newRows) {
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const vals = cols.map(c => row[c] ?? null);
    try {
      await pool.query(
        `INSERT INTO "houses" (${colSql}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
        vals
      );
      done++;
    } catch (e) {
      failed++;
      console.error(`\n  ❌ ${row.id}: ${e.message}`);
      if (e.message.includes('project size limit')) break;
    }
  }
  console.log(`\n  ✓ 插入成功 ${done} 筆，失敗 ${failed} 筆`);

  // 最終大小
  const finalSize = await pool.query(`
    SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total
    FROM pg_class WHERE relkind='r'
  `);
  console.log(`\nNeon 最終用量: ${finalSize.rows[0].total}`);
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
