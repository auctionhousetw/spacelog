import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string }>;
type SearchParams = Promise<{
  page?: string; txType?: string; bldType?: string;
  priceMin?: string; priceMax?: string; sort?: string;
}>;

// 坪 = 3.30579 ㎡；單價萬/坪 = 單價元/㎡ × 3.30579 / 10000
const sqmToPing = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number) => (u * 3.30579) / 10000;

function statusColor(txType: string | null) {
  if (!txType) return { bg: '#f5f5f3', text: '#aaa', border: '#e8e8e4' };
  if (txType.includes('建物')) return { bg: '#f0f5ff', text: '#2a5298', border: '#b8d0f0' };
  if (txType.includes('土地')) return { bg: '#f4fbf0', text: '#3a7d2c', border: '#b5dba5' };
  return { bg: '#f5f5f3', text: '#888', border: '#e8e8e4' };
}

// BigInt → number so unstable_cache can JSON-serialize the result
function normRows(rows: any[]): any[] {
  return rows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])
    )
  );
}

// 5 static queries cached per (city, district) for 24 h.
// They don't depend on user filters, so one cache entry covers every filter combo.
const getDistrictStaticData = unstable_cache(
  async (city: string, district: string) => {
    const isAll  = district === '全區';
    const safeC  = city.replace(/'/g, "''");
    const safeD  = district.replace(/'/g, "''");
    const baseDW = `city='${safeC}'${!isAll ? ` AND district='${safeD}'` : ''}`;

    const [metaRows, bldTypeRows, bldTypeStatsRows, roadStatsRows, yearTrendRows, priceRangeRows] =
      await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg
           FROM lvr_land WHERE ${baseDW} AND tx_type LIKE '%建物%'`
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT building_type FROM lvr_land
           WHERE ${baseDW} AND building_type IS NOT NULL AND building_type != ''
           ORDER BY building_type`
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT building_type,
                  COUNT(*) as n,
                  AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price,
                  AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                  MIN(CASE WHEN total_price > 0 THEN total_price END) as min_price,
                  MAX(CASE WHEN total_price > 0 THEN total_price END) as max_price
           FROM lvr_land
           WHERE ${baseDW} AND tx_type LIKE '%建物%'
             AND building_type IS NOT NULL AND building_type != ''
             AND total_price > 0
           GROUP BY building_type ORDER BY n DESC LIMIT 8`
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT
             CASE
               WHEN STRPOS(address,'路') > 0
                 AND (STRPOS(address,'街') = 0 OR STRPOS(address,'路') <= STRPOS(address,'街'))
                 THEN SUBSTRING(address, 1, STRPOS(address,'路'))
               WHEN STRPOS(address,'街') > 0
                 THEN SUBSTRING(address, 1, STRPOS(address,'街'))
               ELSE SUBSTRING(address, 1, 6)
             END as road_name,
             COUNT(*) as n,
             AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
             AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price
           FROM lvr_land
           WHERE ${baseDW} AND tx_type LIKE '%建物%'
             AND address IS NOT NULL AND address != ''
             AND unit_price_sqm > 0
           GROUP BY CASE
               WHEN STRPOS(address,'路') > 0
                 AND (STRPOS(address,'街') = 0 OR STRPOS(address,'路') <= STRPOS(address,'街'))
                 THEN SUBSTRING(address, 1, STRPOS(address,'路'))
               WHEN STRPOS(address,'街') > 0
                 THEN SUBSTRING(address, 1, STRPOS(address,'街'))
               ELSE SUBSTRING(address, 1, 6)
             END
           HAVING COUNT(*) >= 2
           ORDER BY avg_unit DESC LIMIT 10`
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT
             SUBSTRING(tx_date_iso, 1, 4) as year,
             COUNT(*) as n,
             AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price,
             AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit
           FROM lvr_land
           WHERE ${baseDW} AND tx_type LIKE '%建物%'
             AND tx_date_iso IS NOT NULL AND tx_date_iso != ''
             AND total_price > 0
           GROUP BY SUBSTRING(tx_date_iso, 1, 4)
           HAVING SUBSTRING(tx_date_iso, 1, 4) >= '2020' AND SUBSTRING(tx_date_iso, 1, 4) <= '2030'
           ORDER BY 1`
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT
             CASE
               WHEN total_price < 3000000   THEN '300萬以下'
               WHEN total_price < 5000000   THEN '300-500萬'
               WHEN total_price < 10000000  THEN '500萬-1千萬'
               WHEN total_price < 20000000  THEN '1千-2千萬'
               WHEN total_price < 50000000  THEN '2千-5千萬'
               ELSE '5千萬以上'
             END as range_label,
             MIN(total_price) as range_min,
             COUNT(*) as n
           FROM lvr_land
           WHERE ${baseDW} AND tx_type LIKE '%建物%' AND total_price > 0
           GROUP BY range_label ORDER BY range_min`
        ),
      ]);

    const meta = normRows(metaRows)[0] ?? {};
    return {
      metaAvg: meta.avg ? Math.round(Number(meta.avg) / 10000) : 0,
      metaN:   Number(meta.n || 0),
      bldTypes:      bldTypeRows.map((r: any) => r.building_type).filter(Boolean),
      bldTypeStats:  normRows(bldTypeStatsRows),
      roadStats:     normRows(roadStatsRows).filter((r: any) => r.road_name && r.road_name.length >= 2),
      yearTrend:     normRows(yearTrendRows),
      priceRanges:   normRows(priceRangeRows),
    };
  },
  ['district-static'],
  { revalidate: 86400 }
);

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  let avg = 0, n = 0;
  try {
    const { metaAvg, metaN } = await getDistrictStaticData(c, d);
    avg = metaAvg;
    n   = metaN;
  } catch { /* ignore */ }
  return {
    title: `${c}${d}實價登錄 | 各類型均價・路段行情・成交紀錄`,
    description: `${c}${d}實際成交行情，共 ${n} 筆成交${avg ? `，建物均價約 ${avg} 萬` : ''}。查詢大樓、公寓、透天各類型均價，路段熱門排行，並與法拍底價對比。`,
    alternates: { canonical: `/price/${city}/${district}` },
  };
}

export default async function LvrDistrictPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { city, district } = await params;
  const sp = await searchParams;

  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const isAll = d === '全區';

  const page     = Math.max(1, parseInt(sp.page || '1', 10));
  const txType   = sp.txType  || '';   // 'building' | 'land' | ''
  const bldType  = sp.bldType || '';   // 公寓 / 大樓 / 透天厝 / …
  const priceMin = sp.priceMin ? parseInt(sp.priceMin, 10) : null;
  const priceMax = sp.priceMax ? parseInt(sp.priceMax, 10) : null;
  const sort     = sp.sort || 'date';
  const pageSize = 30;

  let records: any[] = [];
  let totalCount = 0;
  let distStats: any = null;
  let bldTypes: string[] = [];
  let bldTypeStats: any[] = [];   // 建物類型均價
  let roadStats: any[]    = [];   // 熱門路段
  let priceRanges: any[]  = [];   // 成交價格分布
  let yearTrend: any[]    = [];   // 年度均價趨勢

  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  try {
    const conds = [`city = '${safeC}'`];
    if (!isAll) conds.push(`district = '${safeD}'`);
    if (txType === 'building') conds.push(`tx_type LIKE '%建物%'`);
    if (txType === 'land')     conds.push(`tx_type = '土地'`);
    if (bldType) conds.push(`building_type = '${bldType.replace(/'/g, "''")}'`);
    if (priceMin !== null) conds.push(`total_price >= ${priceMin * 10000}`);
    if (priceMax !== null) conds.push(`total_price <= ${priceMax * 10000}`);
    const where = conds.join(' AND ');

    const orderBy = sort === 'price'
      ? `CASE WHEN total_price IS NULL OR total_price=0 THEN 1 ELSE 0 END, total_price DESC`
      : `CASE WHEN tx_date_iso IS NULL OR tx_date_iso='' THEN 1 ELSE 0 END, tx_date_iso DESC`;

    const [staticData, fetched, countRows, statsRows] = await Promise.all([
      // 靜態統計資料（city+district 固定，24h 快取）
      getDistrictStaticData(c, d),
      // 交易列表（依篩選條件動態查詢）
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_land WHERE ${where} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      ),
      // 總筆數
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n FROM lvr_land WHERE ${where}`,
      ),
      // 基本統計
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price > 0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                MAX(CASE WHEN total_price > 0 THEN total_price END) as max_price,
                MIN(CASE WHEN total_price > 0 THEN total_price END) as min_price,
                MAX(tx_date_iso) as latest, MIN(tx_date_iso) as oldest
         FROM lvr_land WHERE ${where}`,
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    totalCount    = Number(countRows[0].n);
    distStats     = statsRows[0];
    bldTypes      = staticData.bldTypes;
    bldTypeStats  = staticData.bldTypeStats;
    roadStats     = staticData.roadStats;
    yearTrend     = staticData.yearTrend;
    priceRanges   = staticData.priceRanges;

    // 同地址歷年成交：批次查詢當前頁面所有地址的歷史記錄
    const addrs = [...new Set(fetched.map((r: any) => r.address).filter(Boolean))] as string[];
    if (addrs.length > 0) {
      const placeholders = addrs.map((_, i) => `$${i + 1}`).join(',');
      const histRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT address,
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
         HAVING COUNT(*) > 1`,
        ...addrs
      );
      // 將歷史資訊合併進 records
      const histMap = Object.fromEntries(histRows.map((h: any) => [h.address, h]));
      records = fetched.map((r: any) => ({ ...r, _hist: histMap[r.address] || null }));
    } else {
      records = fetched;
    }
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const avgWan     = distStats.avg ? Math.round(Number(distStats.avg) / 10000) : null;
  const avgUnit    = distStats.avg_unit ? unitSqmToWanPerPing(Number(distStats.avg_unit)) : null;

  // buildHref
  const q = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number | undefined> = {
      page, txType, bldType, sort,
      priceMin: priceMin ?? undefined,
      priceMax: priceMax ?? undefined,
    };
    const merged = { ...base, ...overrides };
    const pairs = Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined && v !== null);
    const qs = pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}${qs ? '?' + qs : ''}`;
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: var(--font-noto-sans-tc), sans-serif; color: #333; }

        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1.5rem; height: 52px; }
        .site-logo { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; font-family: var(--font-noto-sans-tc), sans-serif; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .nav-link.blue { color: #2a5298; }

        .hero { background: #fff; border-top: 3px solid #2a5298; border-bottom: 1px solid #ececec; padding: 1.1rem clamp(1rem,3vw,2rem); }
        .hero-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
        .hero-h1 { font-family: var(--font-noto-serif-tc), serif; font-size: 1.2rem; font-weight: 700; color: #1e3a6e; }
        .hero-sub { font-size: .82rem; color: #aaa; font-weight: 300; }
        .hero-stat { font-size: .82rem; color: #2a5298; font-weight: 400; margin-left: auto; }

        .layout { max-width: 1200px; margin: 0 auto; padding: clamp(1rem,3vw,1.75rem) clamp(1rem,3vw,2rem); display: grid; grid-template-columns: 190px 1fr; gap: 1.5rem; }
        .sidebar { background: #fff; border: 1px solid #e0e8f8; position: sticky; top: 64px; }
        .sb-head { padding: .6rem 1rem; font-size: 9.5px; font-weight: 500; letter-spacing: .14em; color: #2a5298; background: #f0f5ff; border-left: 3px solid #2a5298; }
        .sb-section { border-bottom: 1px solid #f0f5ff; }
        .sb-section:last-child { border-bottom: none; }
        .filter-opt { display: flex; align-items: center; gap: 8px; padding: .42rem 1rem; font-size: .8rem; color: #666; text-decoration: none; border-left: 3px solid transparent; transition: all .12s; }
        .filter-opt:hover { color: #2a5298; background: #f5f9ff; border-left-color: #b8d0f0; }
        .filter-opt.active { color: #2a5298; font-weight: 500; background: #eef4ff; border-left-color: #2a5298; }
        .filter-dot { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid #ddd; flex-shrink: 0; }
        .filter-opt.active .filter-dot { border-color: #2a5298; background: #2a5298; }

        .bld-type-card { background: #fff; padding: .9rem 1rem; text-decoration: none; color: inherit; display: block; transition: background .15s; }
        .bld-type-card:hover { background: #f0f5ff !important; }
        .road-stat-link { padding: .5rem 1rem; display: flex; align-items: center; gap: 1rem; text-decoration: none; color: inherit; transition: background .12s; }
        .road-stat-link:hover { background: #f8fbff; }

        .price-range { padding: .6rem 1rem .85rem; display: flex; flex-direction: column; gap: 6px; }
        .price-row { display: flex; align-items: center; gap: 5px; }
        .price-input { flex: 1; min-width: 0; padding: .28rem .45rem; font-size: .78rem; border: 1px solid #e0e8f8; outline: none; font-family: var(--font-noto-sans-tc), sans-serif; color: #444; background: #fafafa; }
        .price-input:focus { border-color: #2a5298; }
        .price-btn { display: block; width: 100%; padding: .36rem 0; font-size: .76rem; font-weight: 500; text-align: center; background: #2a5298; color: #fff; border: none; cursor: pointer; font-family: var(--font-noto-sans-tc), sans-serif; margin-top: 2px; }
        .price-btn:hover { background: #1e3a6e; }

        .sort-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; flex-wrap: wrap; }
        .sort-tab { padding: .28rem .75rem; font-size: .78rem; color: #888; background: #fff; border: 1px solid #e0e8f8; text-decoration: none; transition: all .15s; }
        .sort-tab:hover { color: #2a5298; border-color: #2a5298; }
        .sort-tab.active { background: #2a5298; color: #fff; border-color: #2a5298; }

        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 8px; background: #fff; border: 1px solid #e0e8f8; padding: 1rem 1.25rem; margin-bottom: 1rem; }
        .stat-item { text-align: center; }
        .stat-val { font-family: var(--font-noto-serif-tc), serif; font-size: 1.25rem; font-weight: 700; color: #2a5298; }
        .stat-label { font-size: .72rem; color: #aaa; font-weight: 300; }

        .card-list { display: flex; flex-direction: column; gap: 1px; }
        .tx-card { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 1fr auto; align-items: stretch; transition: box-shadow .15s; }
        .tx-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,.06); }
        .card-body { padding: .85rem 1rem; min-width: 0; }
        .card-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: .4rem; }
        .badge { font-size: 10px; font-weight: 500; letter-spacing: .04em; padding: .17rem .5rem; }
        .card-addr { font-family: var(--font-noto-serif-tc), serif; font-size: .88rem; font-weight: 500; color: #333; line-height: 1.6; margin-bottom: .3rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .card-meta { display: flex; flex-wrap: wrap; gap: .4rem 1rem; font-size: .75rem; color: #999; }
        .card-meta strong { color: #555; font-weight: 400; }
        .card-date { font-size: .72rem; color: #bbb; font-weight: 300; margin-top: .4rem; }
        .price-col { padding: .85rem 1.1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #f0f5ff; min-width: 100px; flex-shrink: 0; gap: .25rem; }
        .price-label { font-size: 9.5px; color: #aaa; letter-spacing: .08em; }
        .price-val { font-family: var(--font-noto-serif-tc), serif; font-size: 1.3rem; font-weight: 700; color: #2a5298; line-height: 1.2; }
        .price-val small { font-size: .68rem; font-weight: 400; color: #2a5298; margin-left: 2px; }
        .price-unit { font-size: .75rem; color: #aaa; font-weight: 300; }

        .pagination { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 1.5rem; }
        .page-btn { display: inline-block; padding: .42rem .85rem; font-size: .8rem; color: #888; background: #fff; border: 1px solid #e0e8f8; text-decoration: none; transition: all .15s; }
        .page-btn:hover { border-color: #2a5298; color: #2a5298; }
        .page-btn.active { background: #2a5298; color: #fff; border-color: #2a5298; }
        .page-btn.disabled { color: #ddd; border-color: #f0f0f0; pointer-events: none; }

        .price-mobile { display: none; }

        /* 桌機：sidebar-details 一律展開（覆蓋 details 預設收折） */
        .sidebar-toggle { display: none; }
        .sidebar-details > :not(summary) { display: block; }

        /* 平板（769px–1024px）：sidebar 縮窄，統計列改 2 欄 */
        @media(min-width:769px) and (max-width:1024px) {
          .layout { grid-template-columns: 160px 1fr; gap: 1rem; padding: 1rem; }
          .sidebar { top: 56px; }
          .sb-head { font-size: 8.5px; }
          .filter-opt { font-size: .75rem; padding: .38rem .8rem; }
          .stats-bar { grid-template-columns: repeat(2, 1fr); }
          .card-addr { font-size: .82rem; }
          .price-val { font-size: 1.1rem; }
          .price-col { min-width: 85px; padding: .7rem .8rem; }
        }

        @media(max-width:768px) {
          .layout { grid-template-columns: 1fr; }
          /* 主內容優先，sidebar 排到最後 */
          .sidebar { position: static; order: 2; margin-top: .5rem; }
          .layout > main { order: 1; }
          .price-col { display: none; }
          .price-mobile {
            display: flex; align-items: baseline; gap: 6px;
            margin-bottom: .35rem;
          }
          /* 手機：顯示收合按鈕，讓 details 回歸原生行為 */
          .sidebar-toggle {
            display: flex; align-items: center; justify-content: space-between;
            padding: .7rem 1rem; font-size: .85rem; font-weight: 500;
            color: #2a5298; cursor: pointer; list-style: none;
            background: #f0f5ff; border-bottom: 1px solid #e0e8f8;
          }
          .sidebar-toggle::-webkit-details-marker { display: none; }
          .sidebar-toggle::marker { content: ''; }
          .sidebar-toggle::after { content: '▾'; margin-left: auto; font-size: .9rem; }
          .sidebar-details[open] .sidebar-toggle::after { content: '▴'; }
          .sidebar-details > :not(summary) { display: revert; }
        }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link blue">實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',           item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}` },
          { '@type': 'ListItem', position: 2, name: `${c}實價登錄`,   item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/price/${encodeURIComponent(c)}` },
          { '@type': 'ListItem', position: 3, name: `${c}${d}實價登錄` },
        ],
      }) }} />

      {/* Hero */}
      <div className="hero">
        <div className="hero-inner">
          <h1 className="hero-h1">
            {c}{!isAll && ` › ${d}`} 實價登錄
          </h1>
          <span className="hero-sub">
            {isAll ? `${c}全區域` : `${d} 行政區`} 共{' '}
            <strong style={{ color: '#2a5298' }}>{totalCount.toLocaleString()}</strong> 筆成交記錄
            {avgWan ? <>，建物成交均價約 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></> : ''}
            {avgUnit ? <>，均坪單價 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬/坪</strong></> : ''}
            。資料來源：內政部不動產交易實價登錄。
          </span>
          <span className="hero-stat">第 {page}/{totalPages || 1} 頁</span>
        </div>
      </div>

      <div className="layout">

        {/* ── 左側篩選 ── */}
        <aside className="sidebar">
          <details className="sidebar-details">
            <summary className="sidebar-toggle">
              篩選條件
              {(txType || bldType || priceMin || priceMax) && (
                <span style={{ fontSize: '.7rem', background: '#2a5298', color: '#fff', padding: '.1rem .5rem', borderRadius: 10, marginLeft: 8 }}>已篩選</span>
              )}
            </summary>

            {/* 麵包屑 */}
            <div style={{ padding: '.8rem 1rem', borderBottom: '1px solid #f0f5ff', fontSize: 11, lineHeight: 1.9 }}>
              <a href="/price" style={{ color: '#2a5298', textDecoration: 'none' }}>實價登錄</a>
              <span style={{ color: '#ccc', margin: '0 4px' }}>›</span>
              <a href={`/price/${encodeURIComponent(c)}`} style={{ color: '#2a5298', textDecoration: 'none' }}>{c}</a>
              {!isAll && <><span style={{ color: '#ccc', margin: '0 4px' }}>›</span><span style={{ color: '#666' }}>{d}</span></>}
            </div>

            {/* 交易類型 */}
            <div className="sb-section">
              <div className="sb-head">交易類型</div>
              <a href={q({ txType: '', page: 1 })} className={`filter-opt${!txType ? ' active' : ''}`}>
                <span className="filter-dot" />全部
              </a>
              <a href={q({ txType: 'building', page: 1 })} className={`filter-opt${txType === 'building' ? ' active' : ''}`}>
                <span className="filter-dot" />建物交易
              </a>
              <a href={q({ txType: 'land', page: 1 })} className={`filter-opt${txType === 'land' ? ' active' : ''}`}>
                <span className="filter-dot" />土地交易
              </a>
            </div>

            {/* 建物型態 */}
            {bldTypes.length > 0 && (
              <div className="sb-section">
                <div className="sb-head">建物型態</div>
                <a href={q({ bldType: '', page: 1 })} className={`filter-opt${!bldType ? ' active' : ''}`}>
                  <span className="filter-dot" />全部
                </a>
                {bldTypes.slice(0, 8).map(bt => (
                  <a key={bt} href={q({ bldType: bt, page: 1 })} className={`filter-opt${bldType === bt ? ' active' : ''}`}>
                    <span className="filter-dot" />{bt}
                  </a>
                ))}
              </div>
            )}

            {/* 價格區間 */}
            <div className="sb-section">
              <div className="sb-head">總價區間（萬）</div>
              {[
                { label: '不限',         min: '',     max: ''      },
                { label: '500 萬以下',    min: '',     max: '500'   },
                { label: '500–1,000 萬',  min: '500',  max: '1000'  },
                { label: '1,000–2,000 萬',min: '1000', max: '2000'  },
                { label: '2,000 萬以上',  min: '2000', max: ''      },
              ].map(opt => {
                const isActive =
                  (priceMin === null ? '' : String(priceMin)) === opt.min &&
                  (priceMax === null ? '' : String(priceMax)) === opt.max;
                return (
                  <a key={opt.label}
                    href={q({ priceMin: opt.min || undefined, priceMax: opt.max || undefined, page: 1 })}
                    className={`filter-opt${isActive ? ' active' : ''}`}>
                    <span className="filter-dot" />{opt.label}
                  </a>
                );
              })}
              <form className="price-range" action={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} method="get">
                <input type="hidden" name="txType"  value={txType} />
                <input type="hidden" name="bldType" value={bldType} />
                <input type="hidden" name="sort"    value={sort} />
                <div className="price-row">
                  <input className="price-input" type="number" name="priceMin" placeholder="最低" defaultValue={priceMin ?? ''} min={0} />
                  <span style={{ color: '#ccc', fontSize: '.7rem' }}>–</span>
                  <input className="price-input" type="number" name="priceMax" placeholder="最高" defaultValue={priceMax ?? ''} min={0} />
                </div>
                <button type="submit" className="price-btn">套用</button>
              </form>
            </div>

            {/* 排序 */}
            <div className="sb-section">
              <div className="sb-head">排序</div>
              <a href={q({ sort: 'date', page: 1 })} className={`filter-opt${sort === 'date' ? ' active' : ''}`}>
                <span className="filter-dot" />依成交日期
              </a>
              <a href={q({ sort: 'price', page: 1 })} className={`filter-opt${sort === 'price' ? ' active' : ''}`}>
                <span className="filter-dot" />依總價 ↓
              </a>
            </div>
          </details>
        </aside>

        {/* ── 右側主區 ── */}
        <main>

          {/* 統計列 */}
          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-val">{totalCount.toLocaleString()}</div>
              <div className="stat-label">成交筆數</div>
            </div>
            {avgWan && (
              <div className="stat-item">
                <div className="stat-val">{avgWan.toLocaleString()}<small style={{ fontSize: '.65rem', fontWeight: 400, color: '#2a5298' }}>萬</small></div>
                <div className="stat-label">成交均價</div>
              </div>
            )}
            {avgUnit && (
              <div className="stat-item">
                <div className="stat-val">{avgUnit.toFixed(1)}</div>
                <div className="stat-label">均價（萬/坪）</div>
              </div>
            )}
            {distStats.latest && (
              <div className="stat-item">
                <div className="stat-val" style={{ fontSize: '.95rem' }}>{distStats.latest}</div>
                <div className="stat-label">最新成交日</div>
              </div>
            )}
          </div>

          {/* ── 年度均價走勢 ── */}
          {yearTrend.length >= 2 && (() => {
            const maxAvg = Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0)));
            const maxUnit = Math.max(...yearTrend.map((r: any) => Number(r.avg_unit || 0)));
            return (
              <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
                    歷年均價走勢
                  </span>
                  <span style={{ fontSize: '.72rem', color: '#8aabdf' }}>
                    {yearTrend[0]?.year}～{yearTrend[yearTrend.length - 1]?.year} · 建物交易
                  </span>
                </div>
                {/* 走勢圖：橫向可捲動，避免多年份在手機上溢出 */}
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ padding: '1rem 1rem .75rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 120, minWidth: `${yearTrend.length * 56}px` }}>
                  {yearTrend.map((r: any) => {
                    const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                    const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                    const pct   = r.avg_price ? Math.round((Number(r.avg_price) / maxAvg) * 85) + 10 : 10;
                    return (
                      <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        {/* 數值標籤 */}
                        <div style={{ fontSize: '.68rem', color: '#2a5298', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {avgW ? `${avgW.toLocaleString()}萬` : '—'}
                        </div>
                        {unitW && <div style={{ fontSize: '.62rem', color: '#8aabdf', whiteSpace: 'nowrap' }}>{unitW}萬/坪</div>}
                        {/* 長條 */}
                        <div style={{ width: '100%', height: `${pct}px`, background: '#2a5298', borderRadius: '3px 3px 0 0', opacity: .75 + (0.25 * pct / 95), transition: 'height .3s' }} />
                        {/* 年份標籤 */}
                        <div style={{ fontSize: '.7rem', color: '#888', fontWeight: 500 }}>{r.year}</div>
                        <div style={{ fontSize: '.62rem', color: '#ccc' }}>{Number(r.n).toLocaleString()}筆</div>
                      </div>
                    );
                  })}
                </div>
                </div>{/* /scroll container */}
                {/* 趨勢說明 */}
                {(() => {
                  const first = yearTrend[0];
                  const last  = yearTrend[yearTrend.length - 1];
                  if (!first?.avg_price || !last?.avg_price) return null;
                  const change = Math.round((Number(last.avg_price) - Number(first.avg_price)) / Number(first.avg_price) * 100);
                  const years  = Number(last.year) - Number(first.year);
                  if (years <= 0) return null;
                  return (
                    <div style={{ padding: '.5rem 1rem .75rem', borderTop: '1px solid #f0f5ff', fontSize: '.78rem', color: '#666' }}>
                      {first.year}～{last.year} 年間，{d}建物成交均價
                      <strong style={{ color: change >= 0 ? '#c2632a' : '#3a7d2c', margin: '0 4px' }}>
                        {change >= 0 ? `上漲 ${change}%` : `下跌 ${Math.abs(change)}%`}
                      </strong>
                      （{years} 年）
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── 建物類型均價比較 ── */}
          {bldTypeStats.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8' }}>
                <span style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
                  各建物類型均價比較
                </span>
                <span style={{ fontSize: '.72rem', color: '#8aabdf', marginLeft: 8 }}>全區・建物交易</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, background: '#e0e8f8' }}>
                {bldTypeStats.map((r: any) => {
                  const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                  const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                  const minW  = r.min_price ? Math.round(Number(r.min_price) / 10000) : null;
                  const maxW  = r.max_price ? Math.round(Number(r.max_price) / 10000) : null;
                  return (
                    <a key={r.building_type}
                      href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.building_type)}`}
                      className="bld-type-card">
                      <div style={{ fontSize: '.75rem', color: '#2a5298', fontWeight: 600, marginBottom: '.35rem' }}>
                        {r.building_type}
                        <span style={{ color: '#aaa', fontWeight: 300, marginLeft: 4 }}>({Number(r.n)} 筆)</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '1.15rem', fontWeight: 700, color: '#1e3a6e' }}>
                        {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                      </div>
                      {unitW && <div style={{ fontSize: '.72rem', color: '#6b8cc7', marginTop: '.2rem' }}>{unitW} 萬/坪</div>}
                      {minW && maxW && minW !== maxW && (
                        <div style={{ fontSize: '.68rem', color: '#bbb', marginTop: '.2rem' }}>
                          {minW.toLocaleString()}~{maxW.toLocaleString()} 萬
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 熱門路段均價 ── */}
          {roadStats.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
                  熱門路段均價排行
                </span>
                <span style={{ fontSize: '.72rem', color: '#8aabdf' }}>建物交易・單價萬/坪</span>
              </div>
              <div style={{ padding: '.5rem 0' }}>
                {roadStats.map((r: any, i: number) => {
                  const unitW  = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1)  : null;
                  const priceW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                  const maxUnit = roadStats[0]?.avg_unit ? Number(roadStats[0].avg_unit) : 1;
                  const pct = r.avg_unit ? Math.round((Number(r.avg_unit) / maxUnit) * 100) : 0;
                  return (
                    <a key={r.road_name}
                      href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/road/${encodeURIComponent(r.road_name)}`}
                      className="road-stat-link"
                      style={{ borderBottom: i < roadStats.length - 1 ? '1px solid #f0f5ff' : 'none' }}>
                      <span style={{ width: 18, textAlign: 'right', fontSize: '.72rem', color: i < 3 ? '#2a5298' : '#bbb', fontWeight: i < 3 ? 600 : 300, flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <span style={{ minWidth: 80, fontSize: '.82rem', color: '#333', fontWeight: 500, flexShrink: 0 }}>
                        {r.road_name}
                      </span>
                      <div style={{ flex: 1, height: 6, background: '#e0e8f8', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#2a5298', borderRadius: 3 }} />
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        {unitW && <span style={{ fontSize: '.85rem', fontWeight: 700, color: '#2a5298' }}>{unitW} 萬/坪</span>}
                        {priceW && <span style={{ fontSize: '.7rem', color: '#aaa', marginLeft: 6 }}>均 {priceW.toLocaleString()} 萬</span>}
                        <span style={{ fontSize: '.68rem', color: '#ccc', marginLeft: 4 }}>({Number(r.n)}筆)</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 成交總價分布 ── */}
          {priceRanges.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8' }}>
                <span style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
                  成交總價分布
                </span>
              </div>
              <div style={{ padding: '.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(() => {
                  const maxN = Math.max(...priceRanges.map((r: any) => Number(r.n)));
                  return priceRanges.map((r: any) => {
                    const n   = Number(r.n);
                    const pct = Math.round((n / maxN) * 100);
                    return (
                      <div key={r.range_label} style={{ flex: '1 1 130px', textAlign: 'center' }}>
                        <div style={{ fontSize: '.7rem', color: '#888', marginBottom: '.3rem' }}>{r.range_label}</div>
                        <div style={{ height: 40, background: '#e0e8f8', borderRadius: 2, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                          <div style={{ width: '100%', height: `${pct}%`, background: '#2a5298', transition: 'height .3s' }} />
                        </div>
                        <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#2a5298', marginTop: '.3rem' }}>{n} 筆</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 排序 tabs */}
          <div className="sort-bar">
            <a href={q({ sort: 'date', page: 1 })} className={`sort-tab${sort === 'date' ? ' active' : ''}`}>依成交日期</a>
            <a href={q({ sort: 'price', page: 1 })} className={`sort-tab${sort === 'price' ? ' active' : ''}`}>依總價 ↓</a>
            <span style={{ marginLeft: 'auto', fontSize: '.78rem', color: '#aaa' }}>
              共 {totalCount.toLocaleString()} 筆 · 第 {page}/{totalPages || 1} 頁
            </span>
          </div>

          {/* 交易卡片 */}
          <div className="card-list">
            {records.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #ececec', padding: '3rem 2rem', textAlign: 'center' }}>
                <p style={{ color: '#aaa', fontSize: '.9rem' }}>此條件無成交記錄，請調整篩選條件</p>
              </div>
            ) : records.map((r: any) => {
              const priceWan = r.total_price ? Math.round(r.total_price / 10000) : null;
              const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
              const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
              const sc = statusColor(r.tx_type);

              return (
                <div key={r.id} className="tx-card">
                  <div className="card-body">
                    <div className="card-badges">
                      {r.tx_type && (
                        <span className="badge" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                          {r.tx_type}
                        </span>
                      )}
                      {r.building_type && (
                        <span className="badge" style={{ background: '#f5f5f3', color: '#888', border: '1px solid #e8e8e4' }}>
                          {r.building_type}
                        </span>
                      )}
                      {r.elevator === '有' && (
                        <span className="badge" style={{ background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' }}>
                          電梯
                        </span>
                      )}
                    </div>
                    {priceWan !== null && (
                      <div className="price-mobile">
                        <span style={{ fontFamily: 'var(--font-noto-serif-tc), serif', fontSize: '1.1rem', fontWeight: 700, color: '#2a5298' }}>
                          {priceWan}<span style={{ fontSize: '.68rem', fontWeight: 400 }}>萬</span>
                        </span>
                        {unitWan && <span style={{ fontSize: '.72rem', color: '#aaa' }}>{unitWan} 萬/坪</span>}
                      </div>
                    )}
                    <div className="card-addr">{r.address || '（地號）'}</div>
                    <div className="card-meta">
                      {r.district && <span>📍 {r.district}</span>}
                      {areaPing && <span>建物 <strong>{areaPing}</strong> 坪</span>}
                      {r.bedrooms != null && r.bedrooms > 0 && (
                        <span>{r.bedrooms}房{r.halls ?? ''}廳{r.bathrooms ?? ''}衛</span>
                      )}
                      {r.floor && <span>{r.floor}</span>}
                      {r.total_floors && <span>共 {r.total_floors} 層</span>}
                      {r.build_complete && <span>屋齡 {r.build_complete}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '.3rem' }}>
                      <div className="card-date">📅 成交日 {r.tx_date_iso || r.tx_date || '—'}</div>
                      {r.address?.includes('號') && (() => {
                        const bAddr = r.address.substring(0, r.address.indexOf('號') + 1);
                        return (
                          <a href={`/community/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(bAddr)}`}
                            style={{ fontSize: '.68rem', color: '#2a5298', textDecoration: 'none', marginLeft: 'auto', flexShrink: 0, padding: '.1rem .4rem', background: '#f0f5ff', borderRadius: 2 }}>
                            同棟記錄 →
                          </a>
                        );
                      })()}
                    </div>

                    {/* 同地址歷史記錄 */}
                    {r._hist && Number(r._hist.cnt) > 1 && (() => {
                      const hist = r._hist;
                      const cnt  = Number(hist.cnt);
                      const minW = hist.min_p ? Math.round(Number(hist.min_p) / 10000) : null;
                      const maxW = hist.max_p ? Math.round(Number(hist.max_p) / 10000) : null;
                      // history_summary: "2024:820萬,2022:750萬,2021:680萬"
                      const summaries: string[] = hist.history_summary
                        ? hist.history_summary.split(',').filter(Boolean).slice(0, 4)
                        : [];
                      return (
                        <div style={{ marginTop: '.5rem', padding: '.45rem .65rem', background: '#f0f5ff', borderRadius: 2, borderLeft: '3px solid #2a5298' }}>
                          <div style={{ fontSize: '.7rem', color: '#2a5298', fontWeight: 600, marginBottom: '.25rem' }}>
                            📊 此地址共 {cnt} 筆成交記錄（{hist.earliest?.slice(0,4)}～{hist.latest?.slice(0,4)}）
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {summaries.map((s: string, i: number) => {
                              const [yr, price] = s.split(':');
                              return (
                                <span key={i} style={{ fontSize: '.68rem', color: '#4a6fa8', background: '#e0e8f8', padding: '.12rem .4rem', borderRadius: 2 }}>
                                  {yr}年 {price}
                                </span>
                              );
                            })}
                            {minW && maxW && minW !== maxW && (
                              <span style={{ fontSize: '.68rem', color: '#6b8cc7' }}>
                                區間 {minW.toLocaleString()}~{maxW.toLocaleString()} 萬
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="price-col">
                    <div className="price-label">成交總價</div>
                    <div className="price-val">
                      {priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}
                    </div>
                    {unitWan && <div className="price-unit">{unitWan} 萬/坪</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分頁 */}
          {totalPages > 1 && (() => {
            const nums: (number | '…')[] = [];
            for (let i = 1; i <= totalPages; i++) {
              if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2))
                nums.push(i);
              else if (nums[nums.length - 1] !== '…')
                nums.push('…');
            }
            return (
              <div className="pagination">
                {page > 1
                  ? <a href={q({ page: page - 1 })} className="page-btn">← 上一頁</a>
                  : <span className="page-btn disabled">← 上一頁</span>}
                {nums.map((n, i) =>
                  n === '…'
                    ? <span key={`e${i}`} style={{ color: '#ccc', fontSize: '.8rem', padding: '0 4px' }}>…</span>
                    : <a key={n} href={q({ page: n })} className={`page-btn${n === page ? ' active' : ''}`}>{n}</a>
                )}
                {page < totalPages
                  ? <a href={q({ page: page + 1 })} className="page-btn">下一頁 →</a>
                  : <span className="page-btn disabled">下一頁 →</span>}
              </div>
            );
          })()}

          {/* 同區預售屋入口 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #d1e8d8', padding: '1rem 1.25rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-noto-serif-tc), serif", fontSize: '.88rem', fontWeight: 700, color: '#1a6b3a' }}>
                {!isAll ? `${d} 預售屋成交行情` : `${c} 預售屋成交行情`}
              </div>
              <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.2rem' }}>查看本區建案成交記錄與均價走勢</div>
            </div>
            <a href={isAll ? `/presale/${encodeURIComponent(c)}` : `/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
              style={{ flexShrink: 0, padding: '.45rem 1rem', background: '#1a6b3a', color: '#fff', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', borderRadius: 2, whiteSpace: 'nowrap' }}>
              查看預售屋 →
            </a>
          </div>

        </main>
      </div>
    </>
  );
}
