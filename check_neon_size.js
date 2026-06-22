const { Pool } = require('pg');
const DIRECT_URL = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DIRECT_URL, max: 1 });

pool.query(`
  SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) as size,
         pg_total_relation_size(oid) as bytes
  FROM pg_class
  WHERE relname IN ('lvr_land','lvr_presale','houses','community_names','inherited_land')
  ORDER BY bytes DESC
`).then(r => {
  r.rows.forEach(row => console.log(row.relname.padEnd(20), row.size));
  return pool.query(`SELECT pg_size_pretty(sum(pg_total_relation_size(oid))) as total FROM pg_class WHERE relkind='r'`);
}).then(r => {
  console.log('\nDB 總計:', r.rows[0].total);
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
