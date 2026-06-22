// migrate-lvr-land.js  --  COPY lvr_land 2023+ 到 Neon
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const path = require('path');

const DIRECT = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const MIN_YEAR = '2024'; // 只保留這年以後的資料

const db = new Database(path.join(__dirname, 'prisma', 'foreclosure.db'), { readonly: true });
const pool = new Pool({ connectionString: DIRECT, max: 2 });

function toTsv(val) {
  if (val === null || val === undefined) return '\\N';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function main() {
  // 清掉殘留的舊資料
  const existing = Number((await pool.query('SELECT COUNT(*) as n FROM lvr_land')).rows[0].n);
  if (existing > 0) {
    console.log(`Truncating lvr_land (${existing.toLocaleString()} old rows)...`);
    await pool.query('TRUNCATE lvr_land');
    console.log('Done.\n');
  }

  // 查 SQLite 篩出範圍
  const total = Number(db.prepare(
    `SELECT COUNT(*) as n FROM lvr_land WHERE tx_date_iso >= '${MIN_YEAR}'`
  ).get().n);
  console.log(`COPY lvr_land >= ${MIN_YEAR}: ${total.toLocaleString()} rows`);

  const cols = db.prepare('PRAGMA table_info("lvr_land")').all().map(r => r.name);
  const colSql = cols.map(c => `"${c}"`).join(', ');
  const client = await pool.connect();

  try {
    const stream = client.query(
      copyFrom(`COPY "lvr_land" (${colSql}) FROM STDIN WITH (FORMAT TEXT, DELIMITER '\t', NULL '\\N')`)
    );

    const rows = db.prepare(
      `SELECT * FROM lvr_land WHERE tx_date_iso >= '${MIN_YEAR}' ORDER BY tx_date_iso`
    ).iterate();

    let done = 0;
    const REPORT = 50000;

    for (const row of rows) {
      const line = cols.map(c => toTsv(row[c])).join('\t') + '\n';
      const ok = stream.write(line);
      if (!ok) await new Promise(r => stream.once('drain', r));
      done++;
      if (done % REPORT === 0) {
        process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done/total*100)}%)`);
      }
    }

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end();
    });

    console.log(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (100%)\n✅ 完成！`);
  } finally {
    client.release();
  }

  // 最終確認大小
  const sz = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s`);
  console.log('Neon DB 總大小:', sz.rows[0].s);
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
