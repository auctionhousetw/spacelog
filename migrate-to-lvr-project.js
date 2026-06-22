// migrate-to-lvr-project.js
// 把 lvr_land (2024+) + lvr_presale (全部) 從 SQLite 遷移到 Neon Project B (spacelog-lvr)
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

async function createTables() {
  console.log('建立表格與索引...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "lvr_land" (
      "id" TEXT PRIMARY KEY,
      "city" TEXT, "district" TEXT, "address" TEXT,
      "tx_type" TEXT, "tx_date" TEXT, "tx_date_iso" TEXT,
      "total_price" DOUBLE PRECISION, "unit_price_sqm" DOUBLE PRECISION,
      "building_type" TEXT, "main_use" TEXT,
      "area_sqm" DOUBLE PRECISION, "bedrooms" INTEGER,
      "halls" INTEGER, "bathrooms" INTEGER,
      "elevator" TEXT, "total_floors" TEXT, "floor" TEXT,
      "land_area_sqm" DOUBLE PRECISION, "main_area" DOUBLE PRECISION,
      "aux_area" DOUBLE PRECISION, "balcony_area" DOUBLE PRECISION,
      "build_complete" TEXT, "season" TEXT, "notes" TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_lvr_city"     ON "lvr_land"("city")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_lvr_district" ON "lvr_land"("district")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_lvr_date"     ON "lvr_land"("tx_date_iso")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_lvr_price"    ON "lvr_land"("total_price")`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "lvr_presale" (
      "id" TEXT PRIMARY KEY,
      "city" TEXT, "district" TEXT, "project_name" TEXT, "building_unit" TEXT,
      "address" TEXT, "floor" TEXT, "total_floors" TEXT,
      "building_type" TEXT, "main_use" TEXT, "build_complete" TEXT,
      "area_sqm" DOUBLE PRECISION, "main_area" DOUBLE PRECISION,
      "aux_area" DOUBLE PRECISION, "balcony_area" DOUBLE PRECISION,
      "bedrooms" INTEGER, "halls" INTEGER, "bathrooms" INTEGER,
      "elevator" TEXT, "total_price" DOUBLE PRECISION,
      "unit_price_sqm" DOUBLE PRECISION, "parking_price" DOUBLE PRECISION,
      "tx_date" TEXT, "tx_date_iso" TEXT, "season" TEXT, "notes" TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_presale_city"      ON "lvr_presale"("city")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_presale_district"  ON "lvr_presale"("district")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_presale_date"      ON "lvr_presale"("tx_date_iso")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_presale_project"   ON "lvr_presale"("project_name")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_presale_city_dist" ON "lvr_presale"("city", "district")`);
  console.log('✅ 表格建立完成\n');
}

async function copyTable(tableName, where = '') {
  const countSql = `SELECT COUNT(*) as n FROM "${tableName}"` + (where ? ` WHERE ${where}` : '');
  const total = Number(db.prepare(countSql).get().n);
  console.log(`COPY ${tableName}: ${total.toLocaleString()} rows`);

  const existing = Number((await pool.query(`SELECT COUNT(*) as n FROM "${tableName}"`)).rows[0].n);
  if (existing > 0) {
    process.stdout.write(`  清空舊資料 (${existing.toLocaleString()} rows)... `);
    await pool.query(`TRUNCATE "${tableName}"`);
    console.log('done');
  }

  const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all().map(r => r.name);
  const colSql = cols.map(c => `"${c}"`).join(', ');
  const client = await pool.connect();

  try {
    const stream = client.query(
      copyFrom(`COPY "${tableName}" (${colSql}) FROM STDIN WITH (FORMAT TEXT, DELIMITER '\t', NULL '\\N')`)
    );
    const querySql = `SELECT * FROM "${tableName}"` + (where ? ` WHERE ${where}` : '') + ` ORDER BY id`;
    const rows = db.prepare(querySql).iterate();

    let done = 0;
    for (const row of rows) {
      const line = cols.map(c => toTsv(row[c])).join('\t') + '\n';
      const ok = stream.write(line);
      if (!ok) await new Promise(r => stream.once('drain', r));
      done++;
      if (done % 50000 === 0)
        process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${Math.round(done / total * 100)}%)`);
    }

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end();
    });

    console.log(`\r  ✅ ${done.toLocaleString()} rows 完成`);
  } finally {
    client.release();
  }
}

async function main() {
  await createTables();
  await copyTable('lvr_land', "tx_date_iso >= '2024'");
  await copyTable('lvr_presale');

  const sz = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s`);
  console.log('\nProject B (spacelog-lvr) 總大小:', sz.rows[0].s);
  console.log('\n下一步：執行 truncate-lvr-from-project-a.js 清空 Project A 的 lvr 表');
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { pool.end(); db.close(); });
