// migrate-community-names.js  --  SQLite community_names → Neon
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const BATCH = 2000;

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT_URL, max: 2 });

async function main() {
  // Create table (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_names (
      city     TEXT NOT NULL,
      district TEXT NOT NULL,
      name     TEXT NOT NULL,
      addr     TEXT NOT NULL DEFAULT '',
      source   TEXT DEFAULT 'unknown',
      addrs    TEXT,
      tx_count INTEGER DEFAULT 0,
      raw_name TEXT,
      PRIMARY KEY (city, district, name)
    )
  `);
  // Add raw_name if migrating an existing table that lacks it
  await pool.query(`
    ALTER TABLE community_names ADD COLUMN IF NOT EXISTS raw_name TEXT
  `);
  console.log('Table ready');

  // 不 TRUNCATE：改用 upsert，避免大量 WAL 導致暫時超過 512MB
  // 有地址的記錄才遷移，節省 Neon 空間
  const WHERE = `WHERE addr IS NOT NULL AND addr != ''`;
  const total = Number(db.prepare(`SELECT COUNT(*) as n FROM community_names ${WHERE}`).get().n);
  console.log(`community_names（有地址）: ${total.toLocaleString()} rows`);

  const cols = ['city', 'district', 'name', 'addr', 'source', 'addrs', 'tx_count'];

  let done = 0;
  for (let offset = 0; offset < total; offset += BATCH) {
    const rows = db.prepare(`SELECT * FROM community_names ${WHERE} LIMIT ? OFFSET ?`).all(BATCH, offset);
    if (!rows.length) break;

    const colSql = cols.map(c => `"${c}"`).join(', ');
    const placeholders = rows
      .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
      .join(', ');
    const values = rows.flatMap(row => cols.map(c => row[c] ?? null));

    await pool.query(
      `INSERT INTO community_names (${colSql}) VALUES ${placeholders}
       ON CONFLICT (city, district, name) DO UPDATE SET addr = EXCLUDED.addr`,
      values
    );
    done += rows.length;
    process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done / total * 100)}%)`);
  }
  console.log('\n✅ community_names 完成');
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
