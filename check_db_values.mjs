import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://allvigor2016:r1FEpQG9iUA45XZvLhy8kw@nutty-singer-27272.j77.aws-ap-southeast-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"
});
await client.connect();

// 看 city 欄位有哪些不同值（彰化相關）
const r1 = await client.query(`SELECT DISTINCT city FROM lvr_land WHERE city LIKE '%彰%' ORDER BY city`);
console.log("city 值:", r1.rows.map(r => JSON.stringify(r.city)));

// 看 district 欄位有哪些不同值（彰化市相關）
const r2 = await client.query(`SELECT DISTINCT district FROM lvr_land WHERE city LIKE '%彰%' ORDER BY district LIMIT 30`);
console.log("district 值 (前30):", r2.rows.map(r => JSON.stringify(r.district)));

// 用 Prisma 風格的 where 查 count
const r3 = await client.query(`SELECT COUNT(*) as n FROM lvr_land WHERE city = '彰化縣' AND district = '彰化市'`);
console.log("city='彰化縣' AND district='彰化市' 筆數:", r3.rows[0].n, "型別:", typeof r3.rows[0].n);

// 看 n 的型別是什麼
const r4 = await client.query(`SELECT COUNT(*) as n FROM lvr_land WHERE city = '彰化縣'`);
console.log("彰化縣全部筆數:", r4.rows[0].n, "型別:", typeof r4.rows[0].n, "=== 0?", r4.rows[0].n === 0, "Number()===0?", Number(r4.rows[0].n) === 0);

await client.end();
