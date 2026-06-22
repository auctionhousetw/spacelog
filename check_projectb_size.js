const { Pool } = require('pg');

const DIRECT_LVR = 'postgresql://neondb_owner:npg_xKZswy8P2ipb@ep-fancy-dew-aotd8fk2.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DIRECT_LVR, max: 1 });

async function main() {
  // 各表大小
  const sizes = await pool.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) as total,
           pg_total_relation_size(oid) as bytes
    FROM pg_class
    WHERE relname IN ('lvr_land','lvr_presale') AND relkind='r'
    ORDER BY bytes DESC
  `);
  console.log('=== Project B 各表大小 ===');
  sizes.rows.forEach(r => console.log(` ${r.relname}: ${r.total}`));

  const dbSize = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s, pg_database_size(current_database()) as b`);
  const usedMB = Math.round(dbSize.rows[0].b / 1024 / 1024);
  console.log(`\n DB 總用量: ${dbSize.rows[0].s} (${usedMB} MB)`);
  console.log(` 剩餘空間: ~${512 - usedMB} MB`);

  // lvr_land 各年份筆數（Neon 現有）
  const years = await pool.query(`
    SELECT substr(tx_date_iso,1,4) as yr, COUNT(*) as n
    FROM lvr_land GROUP BY yr ORDER BY yr
  `);
  console.log('\n=== Neon lvr_land 現有各年份 ===');
  years.rows.forEach(r => console.log(` ${r.yr}: ${Number(r.n).toLocaleString()}`));

  const cnt = await pool.query('SELECT COUNT(*) as n FROM lvr_land');
  console.log(` 總計: ${Number(cnt.rows[0].n).toLocaleString()}`);
}

main()
  .catch(err => console.error('Error:', err.message))
  .finally(() => pool.end());
