const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  max: 1
});

async function main() {
  const counts = await pool.query(`
    SELECT 'lvr_land' as t, COUNT(*) as n FROM lvr_land
    UNION ALL SELECT 'houses', COUNT(*) FROM houses
    UNION ALL SELECT 'lvr_presale', COUNT(*) FROM lvr_presale
    UNION ALL SELECT 'community_names', COUNT(*) FROM community_names
  `);
  console.log('Row counts:');
  counts.rows.forEach(r => console.log(' ', r.t, Number(r.n).toLocaleString()));

  const sizes = await pool.query(`
    SELECT tablename,
           pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) as size,
           pg_total_relation_size(quote_ident(tablename)) as bytes
    FROM pg_tables WHERE schemaname='public'
    ORDER BY bytes DESC
  `);
  console.log('\nTable sizes:');
  sizes.rows.forEach(r => console.log(' ', r.tablename, r.size));

  const total = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as total`);
  console.log('\nTotal DB size:', total.rows[0].total);
}

main().catch(e => console.error(e.message)).finally(() => pool.end());
