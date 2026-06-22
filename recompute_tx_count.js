/**
 * recompute_tx_count.js
 * 重算 community_names.tx_count，使用 2023+ 的完整 lvr_land 資料
 * 跨兩個 Neon project（Project A: community_names, Project B: lvr_land）
 *
 * 關鍵：lvr_land address 為全形數字+「臺」，community_names addr 為半形+「台」
 *       需用 translate() 正規化後比對
 *
 * 執行：node recompute_tx_count.js
 */
require('dotenv').config();
const { Client } = require('pg');

const CLIENT_A = new Client({ connectionString: process.env.DIRECT_URL });
const CLIENT_B = new Client({ connectionString: process.env.DIRECT_URL_LVR });

// 全形→半形數字 + 臺→台
const normalizeAddr = (s) =>
  String(s || '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/臺/g, '台');

const stripPrefix = (addr, city, district) => {
  let s = normalizeAddr(addr);
  for (const cv of [city, city.replace(/^台/, '臺').replace(/台/g, '臺'), city.replace(/^臺/, '台')]) {
    const cvN = normalizeAddr(cv);
    if (s.startsWith(cvN)) { s = s.slice(cvN.length); break; }
  }
  const distN = normalizeAddr(district);
  if (s.startsWith(distN)) s = s.slice(distN.length);
  return s.trim();
};

// 去除門牌號以後的樓層/棟別資訊（保留到號）
const stripFloor = (addr) =>
  normalizeAddr(addr)
    .replace(/(\d+號).*$/, '$1')   // 123號以後
    .replace(/(\d+之\d+).*$/, '$1') // 123之5以後
    .trim();

async function main() {
  await CLIENT_A.connect();
  await CLIENT_B.connect();
  console.log('Connected to both Neon projects.');

  // Step 1：拉所有 community_names
  console.log('\nStep 1: Loading community_names...');
  const cnRows = await CLIENT_A.query(`
    SELECT city, district, name, addr, addrs
    FROM community_names
    WHERE name IS NOT NULL AND name != ''
      AND city IS NOT NULL AND city != ''
      AND district IS NOT NULL AND district != ''
  `);
  console.log(`  Loaded ${cnRows.rows.length} communities`);

  // Step 2：收集所有 city/district 組合
  const cityDistSet = new Set(cnRows.rows.map(r => `${r.city}|${r.district}`));
  console.log(`\nStep 2: ${cityDistSet.size} city/district combos to load from lvr_land`);

  // Step 3：對每個 city/district，載入 lvr_land 正規化地址 → count
  // lvrCounts: "city|district|normalizedAddr(stripFloor)" -> count
  const lvrCounts = new Map();
  let cdDone = 0;
  for (const key of cityDistSet) {
    const [city, district] = key.split('|');
    const safeC = city.replace(/'/g, "''");
    const safeD = district.replace(/'/g, "''");
    // 用 translate() 讓 DB 正規化全形→半形，拉回來後再 stripFloor
    const lvrRows = await CLIENT_B.query(
      `SELECT translate(address,'０１２３４５６７８９臺','0123456789台') as addr_norm, COUNT(*) as n
       FROM lvr_land
       WHERE city='${safeC}' AND district='${safeD}'
         AND tx_type LIKE '%建物%' AND total_price > 0
         AND address IS NOT NULL AND address != ''
       GROUP BY addr_norm`
    );
    for (const row of lvrRows.rows) {
      const stripped = stripFloor(row.addr_norm);
      if (!stripped) continue;
      const mk = `${city}|${district}|${stripped}`;
      lvrCounts.set(mk, (lvrCounts.get(mk) || 0) + Number(row.n));
      // 也存前綴去掉城市/行政區的版本
      const withoutPrefix = stripPrefix(stripped, city, district);
      if (withoutPrefix && withoutPrefix !== stripped) {
        const mk2 = `${city}|${district}|${withoutPrefix}`;
        lvrCounts.set(mk2, (lvrCounts.get(mk2) || 0) + Number(row.n));
      }
    }
    cdDone++;
    if (cdDone % 50 === 0) process.stdout.write(`  ${cdDone}/${cityDistSet.size}\r`);
  }
  console.log(`\n  Loaded ${lvrCounts.size} normalized address entries from lvr_land`);

  // Step 4：比對每個社區的 addrs 取得 tx_count
  const updates = [];
  for (const r of cnRows.rows) {
    const { city, district, name, addr, addrs } = r;
    let allAddrs = [];
    try {
      const parsed = Array.isArray(addrs) ? addrs : JSON.parse(String(addrs || '[]'));
      allAddrs = parsed.filter(Boolean);
    } catch {}
    if (!allAddrs.length && addr) allAddrs = [addr];

    let count = 0;
    const seen = new Set();
    for (const a of allAddrs) {
      // 試完整正規化地址（去樓層）
      const stripped = stripFloor(normalizeAddr(a));
      if (stripped && !seen.has(stripped)) {
        seen.add(stripped);
        count += lvrCounts.get(`${city}|${district}|${stripped}`) || 0;
      }
      // 試去掉城市/行政區前綴
      const withoutPrefix = stripPrefix(a, city, district);
      const strippedWP = stripFloor(withoutPrefix);
      if (strippedWP && !seen.has(strippedWP)) {
        seen.add(strippedWP);
        count += lvrCounts.get(`${city}|${district}|${strippedWP}`) || 0;
      }
    }
    updates.push({ city, district, name, count });
  }

  const withData = updates.filter(u => u.count > 0).length;
  console.log(`\nStep 4 Result: ${withData}/${updates.length} communities have tx_count > 0`);

  // Step 5：批次 UPDATE（只更新有差異的）
  console.log('\nStep 5: Updating tx_count...');
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const { city, district, name, count } of batch) {
      const safeC = city.replace(/'/g, "''");
      const safeD = district.replace(/'/g, "''");
      const safeN = name.replace(/'/g, "''");
      await CLIENT_A.query(
        `UPDATE community_names SET tx_count=${count}
         WHERE city='${safeC}' AND district='${safeD}' AND name='${safeN}'`
      );
    }
    updated += batch.length;
    process.stdout.write(`  ${updated}/${updates.length}\r`);
  }
  console.log(`\n  Done. ${updates.length} rows updated.`);

  await CLIENT_A.end();
  await CLIENT_B.end();
  console.log('\nFinished.');
}

main().catch(e => { console.error(e); process.exit(1); });
