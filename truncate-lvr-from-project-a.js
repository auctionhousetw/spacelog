// truncate-lvr-from-project-a.js
// 確認 Project B 有資料後，清空 Project A 的 lvr_land + lvr_presale，釋出 ~455 MB
const { Pool } = require('pg');

const DIRECT_A = 'postgresql://neondb_owner:npg_2w4ZqNtJPlon@ep-orange-lab-aongezyx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const DIRECT_B = 'postgresql://neondb_owner:npg_xKZswy8P2ipb@ep-fancy-dew-aotd8fk2.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const poolA = new Pool({ connectionString: DIRECT_A, max: 1 });
const poolB = new Pool({ connectionString: DIRECT_B, max: 1 });

async function main() {
  // 先確認 Project B 有資料
  const bLvr = await poolB.query(`SELECT COUNT(*) as n FROM lvr_land`);
  const bPresale = await poolB.query(`SELECT COUNT(*) as n FROM lvr_presale`);
  console.log(`Project B lvr_land:    ${Number(bLvr.rows[0].n).toLocaleString()} 筆`);
  console.log(`Project B lvr_presale: ${Number(bPresale.rows[0].n).toLocaleString()} 筆`);

  if (Number(bLvr.rows[0].n) < 100000) {
    console.error('❌ Project B 資料不足，停止操作（確認遷移完成後再執行）');
    process.exit(1);
  }

  // Project A 目前大小
  const szBefore = await poolA.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s`);
  console.log(`\nProject A 清空前大小: ${szBefore.rows[0].s}`);

  // 清空
  console.log('TRUNCATE lvr_land ...');
  await poolA.query(`TRUNCATE lvr_land`);
  console.log('TRUNCATE lvr_presale ...');
  await poolA.query(`TRUNCATE lvr_presale`);

  // VACUUM 回收空間
  console.log('VACUUM lvr_land ...');
  await poolA.query(`VACUUM lvr_land`);
  console.log('VACUUM lvr_presale ...');
  await poolA.query(`VACUUM lvr_presale`);

  const szAfter = await poolA.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s`);
  console.log(`\nProject A 清空後大小: ${szAfter.rows[0].s}`);
  console.log('✅ 完成！Project A 已釋出 lvr 空間，可重新同步法拍資料。');
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => { poolA.end(); poolB.end(); });
