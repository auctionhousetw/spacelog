// 確認今天新抓的 uhomes 資料是否在 Neon
const { Pool } = require('pg');
const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DIRECT_URL, max: 1 });

async function main() {
  const cnt = await pool.query(`SELECT COUNT(*) as n FROM houses`);
  console.log('Neon houses 總筆數:', cnt.rows[0].n);

  const bySource = await pool.query(`
    SELECT source, COUNT(*) as n FROM houses GROUP BY source ORDER BY n DESC
  `);
  console.log('\n來源分布:');
  bySource.rows.forEach(r => console.log(` ${r.source}: ${r.n}`));

  const recent = await pool.query(`
    SELECT COUNT(*) as n FROM houses WHERE auction_date >= '2026-06-01'
  `);
  console.log('\nauction_date >= 2026-06-01 的記錄:', recent.rows[0].n);

  const maxDate = await pool.query(`SELECT MAX(auction_date) as d FROM houses`);
  console.log('最晚開標日:', maxDate.rows[0].d);

  const sizeRes = await pool.query(`
    SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total
    FROM pg_class WHERE relkind='r'
  `);
  console.log('\nNeon 用量:', sizeRes.rows[0].total);
}

main().catch(e => console.error(e.message)).finally(() => pool.end());
