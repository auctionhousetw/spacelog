const { Pool } = require('pg');
const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DIRECT_URL, max: 1 });

async function main() {
  console.log('Running VACUUM ANALYZE on community_names...');
  await pool.query('VACUUM ANALYZE community_names');
  console.log('Done.');

  const r = await pool.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) as size,
           pg_total_relation_size(oid) as bytes
    FROM pg_class
    WHERE relname IN ('lvr_land','lvr_presale','houses','community_names')
    ORDER BY bytes DESC
  `);
  r.rows.forEach(row => console.log(row.relname.padEnd(20), row.size));

  const total = await pool.query(`SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total FROM pg_class WHERE relkind='r'`);
  console.log('\nDB 總計:', total.rows[0].total);

  const cnt = await pool.query(`SELECT COUNT(*) as n FROM community_names`);
  console.log('community_names 現有:', cnt.rows[0].n, '筆');
}

main().catch(e => console.error(e.message)).finally(() => pool.end());
