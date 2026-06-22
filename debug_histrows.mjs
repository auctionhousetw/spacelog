// 用 pg 模組直接測 histRows 查詢（$1,$2 風格，跟 Prisma 一樣）
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://allvigor2016:r1FEpQG9iUA45XZvLhy8kw@nutty-singer-27272.j77.aws-ap-southeast-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"
});

await client.connect();
console.log("✅ 連線成功\n");

const city = "彰化縣", district = "彰化市";
const safeC = city.replace(/'/g, "''");
const safeD = district.replace(/'/g, "''");

// 先取第一頁地址（跟 app 邏輯一樣）
const listRes = await client.query(
  `SELECT * FROM lvr_land WHERE city='${safeC}' AND district='${safeD}'
   ORDER BY CASE WHEN tx_date_iso IS NULL OR tx_date_iso='' THEN 1 ELSE 0 END, tx_date_iso DESC
   LIMIT 30`
);
const addrs = [...new Set(listRes.rows.map(r => r.address).filter(Boolean))];
console.log(`取到 ${addrs.length} 個不重複地址`);

if (addrs.length > 0) {
  const placeholders = addrs.map((_, i) => `$${i + 1}`).join(',');
  const histSql = `
    SELECT address,
           COUNT(*) as cnt,
           MIN(tx_date_iso) as earliest,
           MAX(tx_date_iso) as latest,
           MIN(CASE WHEN total_price > 0 THEN total_price END) as min_p,
           MAX(CASE WHEN total_price > 0 THEN total_price END) as max_p,
           STRING_AGG(
             CASE WHEN total_price > 0
               THEN (SUBSTRING(tx_date_iso,1,4) || ':' || CAST(ROUND(total_price/10000) AS TEXT) || '萬')
             END,
             ',' ORDER BY tx_date_iso DESC) as history_summary
    FROM lvr_land
    WHERE city='${safeC}' AND district='${safeD}'
      AND address IN (${placeholders})
      AND tx_type LIKE '%建物%'
    GROUP BY address
    HAVING COUNT(*) > 1
  `;
  try {
    const histRes = await client.query(histSql, addrs);
    console.log(`✅ histRows: ${histRes.rows.length} 筆，查詢成功`);
    if (histRes.rows.length > 0) console.log("範例:", histRes.rows[0]);
  } catch (e) {
    console.error("❌ histRows 炸了:", e.message);
    console.error("詳細:", e);
  }
}

await client.end();
