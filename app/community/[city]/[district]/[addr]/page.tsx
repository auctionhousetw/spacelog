import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

type Params = Promise<{ city: string; district: string; addr: string }>;

const sqmToPing           = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number)   => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district, addr } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const a = decodeURIComponent(addr);

  let n = 0, avg = 0;
  try {
    const stripMeta = (s2: string) => {
      let s = s2;
      const cv = [c, c.replace(/^台/, '臺'), c.replace(/^臺/, '台')];
      for (const v of cv) { if (s.startsWith(v)) { s = s.slice(v.length); break; } }
      if (s.startsWith(d)) s = s.slice(d.length);
      return s;
    };
    const safeCC = c.replace(/'/g, "''");
    const safeDD = d.replace(/'/g, "''");
    let metaCondition = `address LIKE '%${stripMeta(a).replace(/'/g, "''").replace(/%/g, '\\%')}%'`;
    try {
      const cnMeta = await prisma.$queryRawUnsafe<any[]>(
        `SELECT addrs FROM community_names WHERE city='${safeCC}' AND district='${safeDD}' AND name='${a.replace(/'/g, "''")}' LIMIT 1`
      );
      if (cnMeta[0]?.addrs) {
        let raw: string[] = [];
        try { const f = cnMeta[0].addrs; raw = Array.isArray(f) ? f : JSON.parse(String(f)); } catch {}
        const parts = raw.map(stripMeta).filter(Boolean).slice(0, 30)
          .map(s => `address LIKE '%${s.replace(/'/g, "''").replace(/%/g, '\\%')}%'`);
        if (parts.length > 0) metaCondition = parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0];
      }
    } catch {}
    const rows = await prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg
       FROM lvr_land WHERE city='${safeCC}' AND district='${safeDD}' AND ${metaCondition} AND tx_type LIKE '%建物%'`
    );
    n   = Number(rows[0]?.n || 0);
    avg = rows[0]?.avg ? Math.round(Number(rows[0].avg) / 10000) : 0;
  } catch { /* ignore */ }

  return {
    title: `${a} 歷年成交記錄 | 實價登錄・法拍資訊`,
    description: `${c}${d}${a}共 ${n} 筆歷年實價成交${avg ? `，均價 ${avg} 萬` : ''}。查看歷年成交走勢、各層成交記錄、是否曾出現法拍案件，掌握完整物件歷史。`,
    alternates: { canonical: `/community/${city}/${district}/${addr}` },
  };
}

export default async function CommunityPage({ params }: { params: Params }) {
  const { city, district, addr } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const a = decodeURIComponent(addr);

  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  const stripPrefix = (addr: string): string => {
    let s = addr;
    const cityVariants = [c, c.replace(/^台/, '臺'), c.replace(/^臺/, '台')];
    for (const cv of cityVariants) { if (s.startsWith(cv)) { s = s.slice(cv.length); break; } }
    if (s.startsWith(d)) s = s.slice(d.length);
    return s;
  };

  // 先查 community_names：若 [addr] 參數是社區名稱，用 addrs 陣列聚合所有門牌的 lvr_land
  let communityNameMatch: { name: string; addr: string; allAddrs: string[] } | null = null;
  try {
    const cnRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT name, addr, addrs FROM community_names WHERE city='${safeC}' AND district='${safeD}' AND name='${a.replace(/'/g, "''")}' LIMIT 1`
    );
    if (cnRows[0]?.name) {
      let rawAddrs: string[] = [];
      try { const f = cnRows[0].addrs; rawAddrs = Array.isArray(f) ? f : JSON.parse(String(f || '[]')); } catch {}
      const allAddrs = rawAddrs.length > 0 ? rawAddrs : (cnRows[0].addr ? [String(cnRows[0].addr)] : []);
      communityNameMatch = { name: String(cnRows[0].name), addr: String(cnRows[0].addr || ''), allAddrs };
    }
  } catch { /* ignore */ }

  const addrShort = stripPrefix(communityNameMatch?.addr ?? a);
  const safeA = addrShort.replace(/'/g, "''");

  // SQL 地址條件：社區名稱時 OR 聚合所有門牌，門牌時單一 LIKE
  let addrCondition: string;
  if (communityNameMatch && communityNameMatch.allAddrs.length > 0) {
    const parts = communityNameMatch.allAddrs
      .map(a2 => stripPrefix(a2))
      .filter(Boolean)
      .slice(0, 30)
      .map(s => `address LIKE '%${s.replace(/'/g, "''").replace(/%/g, '\\%')}%'`);
    addrCondition = parts.length > 1 ? `(${parts.join(' OR ')})` : (parts[0] ?? `address LIKE '%${safeA}%'`);
  } else {
    addrCondition = `address LIKE '%${safeA}%'`;
  }

  // 提取路段名（用於周邊查詢）
  const roadName = (() => {
    const ri = addrShort.indexOf('路');
    const si = addrShort.indexOf('街');
    if (ri > 0 && (si === -1 || ri <= si)) return addrShort.slice(0, ri + 1);
    if (si > 0) return addrShort.slice(0, si + 1);
    return '';
  })();
  const safeRoad = roadName.replace(/'/g, "''");

  let lvrRecords: any[] = [], lvrStats: any = null, yearTrend: any[] = [];
  let auctionRecords: any[] = [], distStats: any = null;
  let layoutRows: any[] = [], areaBuckets: any[] = [], floorRows: any[] = [], nearbyRows: any[] = [], presaleRows: any[] = [];
  let projectName: string | null = null;
  let communityAddrs: string[] = [];
  let communityTxCount = 0;

  // base addr：去掉樓層資訊，用於 community_names 查詢
  const addrBase = addrShort.replace(/(\d+號)\s*(?:之\d+\s*)?\s*\d*[樓層棟].*$/, '$1')
                             .replace(/(\d+號)\s*之\d+$/, '$1');
  const safeAddrBase = addrBase.replace(/'/g, "''");

  try {
    const [lvrFetched, lvrStatsRows, trendRows, auctionRows, distStatsRows,
           layoutFetched, areaFetched, floorFetched, nearbyFetched] = await Promise.all([
      // 實價登錄：同門牌所有成交
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%' AND total_price > 0
         ORDER BY tx_date_iso DESC LIMIT 200`
      ),
      // 統計
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MAX(CASE WHEN total_price>0 THEN total_price END) as max_p,
                MIN(CASE WHEN total_price>0 THEN total_price END) as min_p,
                MAX(tx_date_iso) as latest, MIN(tx_date_iso) as earliest
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%' AND total_price > 0`
      ),
      // 年度走勢
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%' AND total_price > 0
         GROUP BY year ORDER BY year`
      ),
      // 法拍屋：同地址（模糊匹配）
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, address, price, unit_price, area, auction_date,
                auction_round, status, delivery, type, city, district
         FROM houses
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition}
         ORDER BY auction_date DESC LIMIT 20`
      ).catch(() => []),
      // 行政區整體均價（對比基準）
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as dist_avg_unit,
                AVG(CASE WHEN total_price>0 THEN total_price END) as dist_avg_price
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND tx_type LIKE '%建物%' AND total_price > 0`
      ).catch(() => []),
      // 格局分布（幾房幾廳）
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT bedrooms, halls, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%' AND total_price > 0
           AND bedrooms IS NOT NULL AND bedrooms > 0
         GROUP BY bedrooms, halls
         ORDER BY n DESC LIMIT 10`
      ).catch(() => []),
      // 坪數分布
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT
           CASE
             WHEN area_sqm < 49.6  THEN '15坪以下'
             WHEN area_sqm < 99.2  THEN '15～30坪'
             WHEN area_sqm < 165.3 THEN '30～50坪'
             ELSE '50坪以上'
           END as range_label,
           MIN(area_sqm) as range_min,
           COUNT(*) as n,
           AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%'
           AND total_price > 0 AND area_sqm > 0
         GROUP BY range_label
         ORDER BY range_min`
      ).catch(() => []),
      // 樓層均價
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT floor, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND ${addrCondition} AND tx_type LIKE '%建物%' AND total_price > 0
           AND floor IS NOT NULL AND floor != ''
         GROUP BY floor
         ORDER BY n DESC LIMIT 12`
      ).catch(() => []),
      // 周邊同路段近期成交（排除本門牌，無路名時回傳空陣列）
      safeRoad
        ? prismaLvr.$queryRawUnsafe<any[]>(
            `SELECT address,
                    CASE WHEN STRPOS(address,'號')>0 THEN SUBSTRING(address,1,STRPOS(address,'號')) ELSE address END as addr_norm,
                    tx_date_iso, total_price, unit_price_sqm, building_type, area_sqm
             FROM lvr_land
             WHERE city='${safeC}' AND district='${safeD}'
               AND address LIKE '%${safeRoad}%'
               AND NOT ${addrCondition.startsWith('(') ? addrCondition : `(${addrCondition})`}
               AND tx_type LIKE '%建物%' AND total_price > 0
             ORDER BY tx_date_iso DESC LIMIT 8`
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    lvrRecords     = lvrFetched;
    lvrStats       = lvrStatsRows[0] && Number(lvrStatsRows[0].n) > 0
      ? lvrStatsRows[0]
      : { n: 0, avg: null, avg_unit: null, max_p: null, min_p: null, latest: null, earliest: null };
    yearTrend      = trendRows;
    auctionRecords = auctionRows;
    distStats      = distStatsRows[0] || null;
    layoutRows     = layoutFetched;
    areaBuckets    = areaFetched;
    floorRows      = floorFetched;
    nearbyRows     = nearbyFetched;
    // 預售屋記錄（同行政區、地址含路名）
    if (roadName) {
      presaleRows = await prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT id, project_name, floor, total_floors, building_type,
                area_sqm, bedrooms, halls, total_price, unit_price_sqm,
                tx_date_iso, city, district
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}'
           AND (address LIKE '%${safeRoad}%' OR project_name LIKE '%${safeRoad.slice(0,-1).replace(/'/g,"''")}%')
           AND total_price > 0
         ORDER BY tx_date_iso DESC LIMIT 10`
      ).catch(() => []);

      // 建案名稱：只用政府委員會來源（gov_committee），避免侵權
      const nameRows = await prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT name FROM community_names
         WHERE city='${safeC}' AND district='${safeD}'
           AND source='gov_committee'
           AND (addr='${safeAddrBase}' OR addr LIKE '${safeAddrBase}%')
         LIMIT 1`
      ).catch(() => []);
      if (nameRows[0]?.name) {
        projectName = nameRows[0].name as string;
      } else {
        // fallback：lvr_presale 用寬鬆路段名比對
        const safeAddrShort = addrShort.replace(/'/g, "''");
        const fallbackRows = await prismaLvr.$queryRawUnsafe<any[]>(
          `SELECT project_name, COUNT(*) as n
           FROM lvr_presale
           WHERE city='${safeC}' AND district='${safeD}'
             AND address LIKE '%${safeAddrShort}%'
             AND project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name ORDER BY n DESC LIMIT 1`
        ).catch(() => []);
        if (fallbackRows[0]?.project_name) projectName = fallbackRows[0].project_name as string;
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const totalCount  = Number(lvrStats.n);
  const avgWan      = lvrStats.avg  ? Math.round(Number(lvrStats.avg) / 10000) : null;
  const avgUnit     = lvrStats.avg_unit ? unitSqmToWanPerPing(Number(lvrStats.avg_unit)) : null;
  const maxWan      = lvrStats.max_p ? Math.round(Number(lvrStats.max_p) / 10000) : null;
  const minWan      = lvrStats.min_p ? Math.round(Number(lvrStats.min_p) / 10000) : null;
  const maxAvgTrend = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;

  const firstYear = yearTrend[0];
  const lastYear  = yearTrend[yearTrend.length - 1];
  const change    = (firstYear?.avg_price && lastYear?.avg_price && firstYear.year !== lastYear.year)
    ? Math.round((Number(lastYear.avg_price) - Number(firstYear.avg_price)) / Number(firstYear.avg_price) * 100)
    : null;

  // 從成交記錄取最常見的總樓層數（眾數）
  const totalFloors = (() => {
    const counts = new Map<string, number>();
    for (const r of lvrRecords) {
      if (r.total_floors) counts.set(r.total_floors, (counts.get(r.total_floors) || 0) + 1);
    }
    if (counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  })();

  // 行政區均價對比
  const distAvgUnit  = distStats?.dist_avg_unit ? unitSqmToWanPerPing(Number(distStats.dist_avg_unit)) : null;
  const distAvgWan   = distStats?.dist_avg_price ? Math.round(Number(distStats.dist_avg_price) / 10000) : null;
  const premiumPct   = (avgUnit && distAvgUnit && distAvgUnit > 0)
    ? Math.round((avgUnit / distAvgUnit - 1) * 100) : null;

  // 判斷是社區大樓還是獨棟物件
  const COMMUNITY_TYPES = ['大樓', '華廈', '公寓', '套房'];
  const isCommunity = lvrRecords.some((r: any) =>
    COMMUNITY_TYPES.some(t => (r.building_type || '').includes(t))
  );
  const pageLabel    = isCommunity ? '社區' : '物件';
  const pageSubLabel = isCommunity ? '社區資訊 · COMMUNITY' : '物件歷史 · PROPERTY HISTORY';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .site-logo span { font-size: .72rem; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .55rem 1rem; background: #f0f5ff; margin: 1.25rem 0 .75rem; }
        .sec-head.orange { color: #c2632a; border-left-color: #c2632a; background: #fff8f4; }
        .tx-row { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 1fr auto; }
        .tx-row:hover { background: #fafbff; }
        .row-body { padding: .75rem 1rem; min-width: 0; }
        .row-addr { font-size: .85rem; color: #444; font-weight: 500; margin-bottom: .2rem; }
        .row-meta { display: flex; flex-wrap: wrap; gap: .35rem .85rem; font-size: .72rem; color: #999; }
        .row-date { font-size: .68rem; color: #bbb; margin-top: .3rem; }
        .row-price { padding: .75rem 1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #f0f5ff; min-width: 90px; flex-shrink: 0; }
        .price-big { font-family: 'Noto Serif TC', serif; font-size: 1.2rem; font-weight: 700; color: #2a5298; }
        .price-big small { font-size: .65rem; color: #2a5298; margin-left: 1px; }
        .auction-row { background: #fff; border: 1px solid #f0c4a0; display: grid; grid-template-columns: 1fr auto; text-decoration: none; color: inherit; }
        .auction-row:hover { background: #fff8f4; }
        @media(max-width:580px) { .row-price { display: none; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '首頁',    item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}` },
              { '@type': 'ListItem', position: 2, name: c,         item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/price/${encodeURIComponent(c)}` },
              { '@type': 'ListItem', position: 3, name: d,         item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}` },
              { '@type': 'ListItem', position: 4, name: a },
            ],
          },
          {
            '@type': 'Apartment',
            name: `${a} 歷年成交記錄`,
            address: { '@type': 'PostalAddress', addressLocality: d, addressRegion: c, addressCountry: 'TW' },
            ...(avgWan ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'TWD', lowPrice: (minWan || avgWan) * 10000, highPrice: (maxWan || avgWan) * 10000, offerCount: totalCount } } : {}),
          },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem) 5rem' }}>

        {/* 麵包屑 */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11, flexWrap: 'wrap' }}>
          <a href="/" className="crumb">首頁</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}`} className="crumb">{c}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="crumb">{d}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#444', fontWeight: 500 }}>{a}</span>
        </nav>

        {/* Hero */}
        <div style={{ background: '#fff', borderTop: '4px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.5rem' }}>
            {pageSubLabel}
          </p>
          {communityNameMatch ? (
            addrShort && (
              <p style={{ fontSize: '.82rem', color: '#888', marginBottom: '.3rem', letterSpacing: '.05em' }}>
                代表門牌：{addrShort}
              </p>
            )
          ) : (
            projectName && (
              <p style={{ fontSize: '.82rem', color: '#c2632a', fontWeight: 600, marginBottom: '.3rem', letterSpacing: '.05em' }}>
                {projectName}
              </p>
            )
          )}
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.9rem)', fontWeight: 700, color: '#1e3a6e', lineHeight: 1.5, marginBottom: '.6rem' }}>
            {communityNameMatch?.name ?? addrShort} {pageLabel}歷年成交
          </h1>
          {totalCount === 0 ? (
            <p style={{ fontSize: '.88rem', color: '#999', fontWeight: 300, lineHeight: 2, margin: 0 }}>
              此地址在 2024 年後暫無實價登錄成交記錄。
              {auctionRecords.length > 0 && <>
                {' '}曾有 <strong style={{ color: '#c2632a' }}>{auctionRecords.length} 筆法拍記錄</strong>。
              </>}
              周邊路段成交行情請參考下方區塊。
            </p>
          ) : (
            <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 2, margin: 0 }}>
              {lvrStats.earliest?.slice(0,4)}～{lvrStats.latest?.slice(0,4)} 年，共{' '}
              <strong style={{ color: '#2a5298' }}>{totalCount} 筆</strong>實價成交記錄
              {avgWan && <>，均價 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></>}
              {avgUnit && <>，每坪 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬</strong></>}
              {premiumPct !== null && distAvgUnit && (
                <>，比{d}均價（{distAvgUnit.toFixed(1)} 萬/坪）
                <strong style={{ color: premiumPct >= 0 ? '#c2632a' : '#3a7d2c', margin: '0 3px' }}>
                  {premiumPct >= 0 ? `高 ${premiumPct}%` : `低 ${Math.abs(premiumPct)}%`}
                </strong>
                </>
              )}
              {minWan && maxWan && minWan !== maxWan && <>，成交區間 {minWan.toLocaleString()}～{maxWan.toLocaleString()} 萬</>}
              {change !== null && <>
                ，{firstYear?.year}年至今均價
                <strong style={{ color: change >= 0 ? '#c2632a' : '#3a7d2c', margin: '0 3px' }}>
                  {change >= 0 ? `漲 ${change}%` : `跌 ${Math.abs(change)}%`}
                </strong>
              </>}
              {totalFloors && <>，地上 <strong style={{ color: '#555' }}>{totalFloors}</strong></>}
              {auctionRecords.length > 0 && <>
                ；此棟曾有{' '}
                <strong style={{ color: '#c2632a' }}>{auctionRecords.length} 筆法拍記錄</strong>
              </>}。
            </p>
          )}
        </div>

        {/* 統計四格 */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ececec', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 1 }}>
          {[
            { label: '成交筆數', value: `${totalCount} 筆`, blue: true },
            { label: '每坪均價',   value: avgUnit ? `${avgUnit.toFixed(1)} 萬` : '—' },
            {
              label: `比${d}均價`,
              value: premiumPct !== null
                ? `${premiumPct >= 0 ? '+' : ''}${premiumPct}%`
                : distAvgUnit ? `區均 ${distAvgUnit.toFixed(1)} 萬` : '—',
              green: premiumPct !== null && premiumPct < 0,
              orange: premiumPct !== null && premiumPct >= 0,
            },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ padding: '1rem clamp(.75rem,2vw,1.25rem)', borderRight: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ fontSize: '.72rem', color: '#aaa', letterSpacing: '.05em', marginBottom: '.3rem' }}>{s.label}</div>
              <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.95rem', fontWeight: 600,
                color: (s as any).blue ? '#2a5298' : (s as any).orange ? '#c2632a' : (s as any).green ? '#3a7d2c' : '#333' }}>
                {s.value}
              </div>
              {i === 2 && distAvgUnit && premiumPct !== null && (
                <div style={{ fontSize: '.68rem', color: '#bbb', marginTop: '.2rem' }}>
                  區均 {distAvgUnit.toFixed(1)} 萬/坪
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 年度走勢 */}
        {yearTrend.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
            <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.9rem', fontWeight: 700, color: '#2a5298' }}>
                歷年成交均價走勢
              </span>
              {change !== null && (
                <span style={{ fontSize: '.75rem', color: change >= 0 ? '#c2632a' : '#3a7d2c', fontWeight: 600 }}>
                  {firstYear?.year}→{lastYear?.year} 年{change >= 0 ? `↑${change}%` : `↓${Math.abs(change)}%`}
                </span>
              )}
            </div>
            <div style={{ padding: '1rem 1rem .75rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 100 }}>
              {yearTrend.map((r: any) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const pct   = r.avg_price ? Math.round((Number(r.avg_price) / maxAvgTrend) * 82) + 12 : 12;
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: '.68rem', color: '#2a5298', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {avgW ? `${avgW.toLocaleString()}萬` : '—'}
                    </div>
                    {unitW && <div style={{ fontSize: '.6rem', color: '#8aabdf' }}>{unitW}/坪</div>}
                    <div style={{ width: '100%', height: `${pct}px`, background: '#2a5298', borderRadius: '3px 3px 0 0', opacity: .65 + 0.35 * (pct / 95) }} />
                    <div style={{ fontSize: '.68rem', color: '#888' }}>{r.year}</div>
                    <div style={{ fontSize: '.6rem', color: '#bbb' }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 格局分布 ── */}
        {layoutRows.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #ececec', marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
            <div style={{ background: '#f5f5f3', padding: '.55rem 1rem', borderBottom: '1px solid #ececec' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.9rem', fontWeight: 700, color: '#555' }}>格局分布</span>
              <span style={{ fontSize: '.72rem', color: '#bbb', marginLeft: 8 }}>{layoutRows.reduce((s: number, r: any) => s + Number(r.n), 0)} 筆有格局記錄</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1, background: '#ececec' }}>
              {layoutRows.map((r: any, i: number) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const label = `${r.bedrooms}房${r.halls ?? ''}廳`;
                return (
                  <div key={i} style={{ background: '#fff', padding: '.75rem 1rem' }}>
                    <div style={{ fontSize: '.78rem', color: '#555', fontWeight: 600, marginBottom: '.2rem' }}>{label}</div>
                    <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.05rem', fontWeight: 700, color: '#333' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    <div style={{ fontSize: '.68rem', color: '#bbb', marginTop: '.15rem' }}>{Number(r.n)} 筆成交</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 坪數分布 ── */}
        {areaBuckets.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #ececec', marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
            <div style={{ background: '#f5f5f3', padding: '.55rem 1rem', borderBottom: '1px solid #ececec' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.9rem', fontWeight: 700, color: '#555' }}>坪數分布</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1, background: '#ececec' }}>
              {areaBuckets.map((r: any, i: number) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const total = areaBuckets.reduce((s: number, x: any) => s + Number(x.n), 0);
                const pct   = total > 0 ? Math.round(Number(r.n) / total * 100) : 0;
                return (
                  <div key={i} style={{ background: '#fff', padding: '.75rem 1rem' }}>
                    <div style={{ fontSize: '.78rem', color: '#555', fontWeight: 600, marginBottom: '.2rem' }}>{r.range_label}</div>
                    <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.05rem', fontWeight: 700, color: '#333' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    <div style={{ fontSize: '.68rem', color: '#bbb', marginTop: '.15rem' }}>{Number(r.n)} 筆・佔 {pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 樓層均價 ── */}
        {floorRows.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid #ececec', marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
            <div style={{ background: '#f5f5f3', padding: '.55rem 1rem', borderBottom: '1px solid #ececec', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.9rem', fontWeight: 700, color: '#555' }}>各樓層成交均價</span>
              {totalFloors && (
                <span style={{ fontSize: '.72rem', color: '#bbb' }}>共 {totalFloors} 層</span>
              )}
            </div>
            <div style={{ padding: '.75rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {floorRows.map((r: any, i: number) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const maxAvg = Math.max(...floorRows.map((x: any) => Number(x.avg_price || 0)));
                const barPct = r.avg_price && maxAvg > 0 ? Math.round(Number(r.avg_price) / maxAvg * 100) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 52, fontSize: '.75rem', color: '#666', fontWeight: 500, flexShrink: 0 }}>{r.floor}</div>
                    <div style={{ flex: 1, background: '#f5f5f3', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: '#2a5298', borderRadius: 2 }} />
                    </div>
                    <div style={{ width: 72, fontSize: '.75rem', color: '#2a5298', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    {unitW && <div style={{ width: 52, fontSize: '.68rem', color: '#bbb', flexShrink: 0 }}>{unitW}/坪</div>}
                    <div style={{ width: 28, fontSize: '.65rem', color: '#ccc', flexShrink: 0 }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 周邊同路段近期成交 ── */}
        {nearbyRows.length > 0 && (
          <>
            <div className="sec-head">📍 {roadName} 周邊近期成交（{nearbyRows.length} 筆）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 1 }}>
              {nearbyRows.map((r: any, i: number) => {
                const priceWan = r.total_price ? Math.round(Number(r.total_price) / 10000) : null;
                const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
                const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(0) : null;
                const communityHref = r.addr_norm
                  ? `/community/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.addr_norm)}`
                  : null;
                return (
                  <div key={i} className="tx-row">
                    <div className="row-body">
                      <div className="row-addr">
                        {communityHref
                          ? <a href={communityHref} style={{ color: '#2a5298', textDecoration: 'none', fontWeight: 500 }}>{r.addr_norm || r.address}</a>
                          : <span>{r.addr_norm || r.address}</span>
                        }
                      </div>
                      <div className="row-meta">
                        {r.building_type && <span style={{ color: '#6b8cc7' }}>{r.building_type}</span>}
                        {areaPing && <span>{areaPing} 坪</span>}
                      </div>
                      <div className="row-date">📅 {r.tx_date_iso || '—'}</div>
                    </div>
                    <div className="row-price">
                      <div style={{ fontSize: 9, color: '#aaa' }}>成交總價</div>
                      <div className="price-big">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                      {unitWan && <div style={{ fontSize: '.7rem', color: '#aaa' }}>{unitWan}萬/坪</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 周邊預售屋成交 ── */}
        {presaleRows.length > 0 && (
          <>
            <div className="sec-head" style={{ color: '#1a6b3a', borderLeftColor: '#1a6b3a', background: '#f0fdf4' }}>
              🏗️ 周邊預售屋成交（{presaleRows.length} 筆）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 1 }}>
              {presaleRows.map((h: any, i: number) => {
                const priceWan = h.total_price ? Math.round(Number(h.total_price) / 10000) : null;
                const unitWan  = h.unit_price_sqm ? unitSqmToWanPerPing(Number(h.unit_price_sqm)).toFixed(1) : null;
                const areaPing = h.area_sqm ? sqmToPing(Number(h.area_sqm)).toFixed(1) : null;
                const href = h.project_name
                  ? `/presale/${encodeURIComponent(h.city)}/${encodeURIComponent(h.district)}/${encodeURIComponent(h.project_name)}`
                  : null;
                return (
                  <div key={i} className="tx-row" style={{ borderColor: '#d1e8d8' }}>
                    <div className="row-body">
                      <div className="row-addr">
                        {href
                          ? <a href={href} style={{ color: '#1a6b3a', textDecoration: 'none', fontWeight: 600 }}>{h.project_name}</a>
                          : <span style={{ color: '#1a6b3a', fontWeight: 600 }}>{h.project_name}</span>
                        }
                      </div>
                      <div className="row-meta">
                        {h.building_type && <span style={{ color: '#2a8a4a' }}>{h.building_type}</span>}
                        {areaPing && <span>{areaPing} 坪</span>}
                        {h.bedrooms > 0 && <span>{h.bedrooms}房{h.halls}廳</span>}
                        {h.floor && <span>{h.floor}</span>}
                      </div>
                      <div className="row-date">📅 成交 {h.tx_date_iso || '—'}</div>
                    </div>
                    <div className="row-price">
                      <div style={{ fontSize: 9, color: '#aaa' }}>預售成交</div>
                      <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.1rem', fontWeight: 700, color: '#1a6b3a' }}>
                        {priceWan ? <>{priceWan}<small style={{ fontSize: '.6rem', marginLeft: 1 }}>萬</small></> : '—'}
                      </div>
                      {unitWan && <div style={{ fontSize: '.68rem', color: '#aaa' }}>{unitWan}萬/坪</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 法拍記錄 */}
        {auctionRecords.length > 0 && (
          <>
            <div className="sec-head orange">⚖️ 此棟法拍記錄（{auctionRecords.length} 筆）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 1 }}>
              {auctionRecords.map((h: any) => {
                const priceWan = h.price ? Math.floor(h.price / 10000) : null;
                const href = `/auction/${encodeURIComponent(h.city)}/${encodeURIComponent(h.district)}/${h.id}`;
                return (
                  <a key={h.id} href={href} className="auction-row">
                    <div className="row-body">
                      <div className="row-addr" style={{ color: '#c2632a' }}>
                        {h.title?.replace(/-[^-]+[市縣].*$/, '') || h.address || '法拍物件'}
                      </div>
                      <div className="row-meta">
                        {h.type && <span style={{ color: '#c2632a' }}>{h.type}</span>}
                        {h.area && <span>{h.area} 坪</span>}
                        {h.auction_round && <span>{h.auction_round}</span>}
                        {h.delivery && <span style={{ color: '#3a7d2c' }}>✓ {h.delivery}</span>}
                      </div>
                      <div className="row-date">
                        📅 開標 {h.auction_date || '—'}
                        {h.status && <span style={{ marginLeft: 8, color: '#c2632a' }}>{h.status}</span>}
                      </div>
                    </div>
                    <div className="row-price">
                      <div style={{ fontSize: 9, color: '#aaa' }}>法拍底價</div>
                      <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.1rem', fontWeight: 700, color: '#c2632a' }}>
                        {priceWan ? <>{priceWan}<small style={{ fontSize: '.62rem', color: '#c2632a', marginLeft: 1 }}>萬</small></> : '—'}
                      </div>
                      {h.unit_price && <div style={{ fontSize: '.7rem', color: '#aaa' }}>{h.unit_price} 萬/坪</div>}
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        )}

        {/* 實價登錄成交記錄 */}
        <div className="sec-head">📊 實價登錄成交記錄（{totalCount} 筆）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '2rem' }}>
          {lvrRecords.map((r: any, i: number) => {
            const priceWan = r.total_price ? Math.round(r.total_price / 10000) : null;
            const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
            const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
            const floorPart = r.address?.includes('號')
              ? r.address.substring(r.address.indexOf('號') + 1).trim()
              : '';
            return (
              <div key={`${r.id}-${i}`} className="tx-row">
                <div className="row-body">
                  <div className="row-addr">
                    {floorPart
                      ? <><span style={{ color: '#2a5298', fontWeight: 600 }}>{floorPart}</span><span style={{ color: '#bbb', fontSize: '.75rem', marginLeft: 6 }}>（{r.address}）</span></>
                      : r.address}
                  </div>
                  <div className="row-meta">
                    {r.building_type && <span style={{ color: '#6b8cc7' }}>{r.building_type}</span>}
                    {areaPing && <span>建物 <strong style={{ color: '#555' }}>{areaPing}</strong> 坪</span>}
                    {r.bedrooms > 0 && <span>{r.bedrooms}房{r.halls}廳{r.bathrooms}衛</span>}
                    {r.floor && <span>{r.floor}</span>}
                    {r.elevator === '有' && <span style={{ color: '#3a7d2c' }}>電梯</span>}
                    {r.build_complete && <span>屋齡 {r.build_complete}</span>}
                  </div>
                  <div className="row-date">📅 成交日 {r.tx_date_iso || '—'}</div>
                </div>
                <div className="row-price">
                  <div style={{ fontSize: 9, color: '#aaa' }}>成交總價</div>
                  <div className="price-big">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                  {unitWan && <div style={{ fontSize: '.7rem', color: '#aaa' }}>{unitWan}萬/坪</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 成交行情解讀 */}
        <div style={{ background: '#f0f5ff', border: '1px solid #e0e8f8', borderLeft: '4px solid #2a5298', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298', marginTop: 0, marginBottom: '.7rem' }}>
            成交行情解讀
          </h2>
          <p style={{ fontSize: '.82rem', color: '#555', fontWeight: 300, lineHeight: 2.1, margin: 0 }}>
            {a} 自 {lvrStats.earliest?.slice(0,4)} 年至 {lvrStats.latest?.slice(0,4)} 年間，共有{' '}
            <strong style={{ color: '#2a5298' }}>{totalCount} 筆</strong>實價登錄建物成交記錄
            {avgWan && <>，成交均價 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪均價 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬</strong></>}
            。
            {premiumPct !== null && distAvgUnit && (
              premiumPct >= 0
                ? <>相較於{d}整體每坪均價 {distAvgUnit.toFixed(1)} 萬，此地址<strong style={{ color: '#c2632a' }}>高出 {premiumPct}%</strong>，屬於該行政區的強勢物件。</>
                : <>相較於{d}整體每坪均價 {distAvgUnit.toFixed(1)} 萬，此地址<strong style={{ color: '#3a7d2c' }}>低 {Math.abs(premiumPct)}%</strong>，具有一定的價格優勢。</>
            )}
            {change !== null && (
              change >= 0
                ? <> 自 {firstYear?.year} 年起成交均價累計上漲 <strong style={{ color: '#c2632a' }}>{change}%</strong>。</>
                : <> 自 {firstYear?.year} 年起成交均價累計下跌 <strong style={{ color: '#3a7d2c' }}>{Math.abs(change)}%</strong>。</>
            )}
            {auctionRecords.length > 0
              ? <> 此地址曾出現 <strong style={{ color: '#c2632a' }}>{auctionRecords.length} 筆法拍記錄</strong>，投資前建議詳查產權狀況與點交條件。</>
              : <> 此地址<strong style={{ color: '#3a7d2c' }}>無法拍記錄</strong>，產權相對穩定。</>
            }
          </p>
        </div>

        {/* 返回行政區 */}
        <div style={{ textAlign: 'center' }}>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
            style={{ display: 'inline-block', padding: '.55rem 1.5rem', background: '#f0f5ff', color: '#2a5298', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none', border: '1px solid #b8d0f0' }}>
            ← {d} 全區行情
          </a>
        </div>

      </main>
    </>
  );
}
