import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';

export const revalidate = 86400;

type Params = Promise<{ city: string; district: string; project: string }>;

const sqmToPing           = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number)   => (u * 3.30579) / 10000;

// ── 樓層數字解析（中文數字 + 阿拉伯數字均支援） ──────────────────────────────
function parseFloorNum(s: string | null): number {
  if (!s) return 0;
  const t = s.replace(/[層樓Ff]/g, '').trim();
  const am = t.match(/^(-?\d+)/);
  if (am) return parseInt(am[1]);
  const cn: Record<string, number> = {
    '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
  };
  let r = 0, cur = 0;
  for (const ch of t) {
    const v = cn[ch];
    if (v === undefined) continue;
    if (v === 10) { r += (cur === 0 ? 1 : cur) * 10; cur = 0; }
    else cur = v;
  }
  return r + cur;
}

// ── 熱圖色階：淺綠（低價）→ 深綠（高價） ────────────────────────────────────
function gridColor(price: number, min: number, max: number): string {
  if (!price || price <= 0 || max <= 0) return '#f5f5f0';
  const pct = max > min ? Math.max(0, Math.min(1, (price - min) / (max - min))) : 0.5;
  return `rgb(${Math.round(200 - pct * 174)},${Math.round(240 - pct * 133)},${Math.round(212 - pct * 154)})`;
}

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district, project } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const p = decodeURIComponent(project);
  let n = 0, avg = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg
       FROM lvr_presale WHERE city='${c.replace(/'/g, "''")}' AND district='${d.replace(/'/g, "''")}' AND project_name='${p.replace(/'/g, "''")}'`
    );
    n   = Number(rows[0]?.n || 0);
    avg = rows[0]?.avg ? Math.round(Number(rows[0].avg) / 10000) : 0;
  } catch { /* ignore */ }
  return {
    title: `${p} 預售屋成交記錄 | ${c}${d}`,
    description: `${c}${d}${p}共 ${n} 筆預售成交記錄${avg ? `，均價 ${avg} 萬` : ''}。查看各樓層、坪數與格局成交行情，掌握建案實際成交價格。`,
    alternates: { canonical: `/presale/${city}/${district}/${project}` },
  };
}

export default async function PresaleProjectPage({ params }: { params: Params }) {
  const { city, district, project } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const p = decodeURIComponent(project);
  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");
  const safeP = p.replace(/'/g, "''");

  let records: any[] = [], stats: any = null;
  let layoutRows: any[] = [], floorRows: any[] = [], areaBuckets: any[] = [], yearTrend: any[] = [];
  let nearbyProjects: any[] = [], districtPrice: any = null, nearbyAuctions: any[] = [];
  let gridRaw: any[] = [];

  try {
    const [recs, statsRows, layouts, floors, areas, trends, nbProjects, distPrice, nbAuctions, rawGrid] = await Promise.all([
      // 所有成交記錄
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND total_price > 0
         ORDER BY tx_date_iso DESC LIMIT 200`
      ),
      // 統計
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MIN(CASE WHEN total_price>0 THEN total_price END) as min_p,
                MAX(CASE WHEN total_price>0 THEN total_price END) as max_p,
                MAX(tx_date_iso) as latest, MIN(tx_date_iso) as earliest,
                MAX(total_floors) as total_floors
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'`
      ),
      // 格局分布
      prisma.$queryRawUnsafe<any[]>(
        `SELECT bedrooms, halls, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND bedrooms IS NOT NULL AND bedrooms > 0 AND total_price > 0
         GROUP BY bedrooms, halls ORDER BY bedrooms, halls`
      ),
      // 樓層均價
      prisma.$queryRawUnsafe<any[]>(
        `SELECT floor, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND floor IS NOT NULL AND floor != '' AND total_price > 0
         GROUP BY floor ORDER BY n DESC LIMIT 15`
      ),
      // 坪數分布
      prisma.$queryRawUnsafe<any[]>(
        `SELECT CASE
                  WHEN area_sqm < 49.6  THEN '15坪以下'
                  WHEN area_sqm < 99.2  THEN '15～30坪'
                  WHEN area_sqm < 165.3 THEN '30～50坪'
                  ELSE '50坪以上'
                END as range_label,
                MIN(area_sqm) as range_min,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND total_price > 0 AND area_sqm > 0
         GROUP BY range_label ORDER BY range_min`
      ),
      // 年度走勢
      prisma.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND total_price > 0
         GROUP BY SUBSTRING(tx_date_iso, 1, 4) ORDER BY 1`
      ),
      // 同區其他預售建案
      prisma.$queryRawUnsafe<any[]>(
        `SELECT project_name, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name != '${safeP}'
           AND project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name ORDER BY n DESC LIMIT 8`
      ),
      // 同區實價成屋行情（近一年）
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MAX(tx_date_iso) as latest
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '1 year', 'YYYY-MM-DD') AND total_price > 0`
      ),
      // 同區法拍物件
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, address, price, area, auction_date, delivery, status, district
         FROM houses
         WHERE city='${safeC}' AND district='${safeD}'
         ORDER BY auction_date DESC LIMIT 6`
      ),
      // 棟別樓層戶別熱圖資料（全量聚合）
      prisma.$queryRawUnsafe<any[]>(
        `SELECT floor, building_unit, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MAX(bedrooms) as bedrooms
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND project_name='${safeP}'
           AND floor IS NOT NULL AND floor != '' AND total_price > 0
         GROUP BY floor, building_unit
         ORDER BY floor, building_unit`
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    records        = recs;
    stats          = statsRows[0];
    layoutRows     = layouts;
    floorRows      = floors;
    areaBuckets    = areas;
    yearTrend      = trends;
    nearbyProjects = nbProjects;
    districtPrice  = distPrice[0] ?? null;
    nearbyAuctions = nbAuctions;
    gridRaw        = rawGrid;
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const total   = Number(stats.n);
  const avgWan  = stats.avg ? Math.round(Number(stats.avg) / 10000) : null;
  const avgUnit = stats.avg_unit ? unitSqmToWanPerPing(Number(stats.avg_unit)) : null;
  const minWan  = stats.min_p ? Math.round(Number(stats.min_p) / 10000) : null;
  const maxWan  = stats.max_p ? Math.round(Number(stats.max_p) / 10000) : null;
  const maxAvg  = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;
  const maxFloorAvg = floorRows.length ? Math.max(...floorRows.map((r: any) => Number(r.avg_price || 0))) : 1;

  // ── 熱圖資料處理 ──────────────────────────────────────────────────────────
  type GridCell = { floorNum: number; unit: string; n: number; avgPrice: number; avgUnit: number; bedrooms: number };
  const gridCells: GridCell[] = gridRaw.map((r: any) => ({
    floorNum: parseFloorNum(r.floor),
    unit: String(r.building_unit || ''),
    n: Number(r.n),
    avgPrice: r.avg_price ? Number(r.avg_price) : 0,
    avgUnit: r.avg_unit ? Number(r.avg_unit) : 0,
    bedrooms: r.bedrooms ? Number(r.bedrooms) : 0,
  }));

  const distinctUnits = new Set(gridCells.filter(c => c.unit).map(c => c.unit));
  const showGrid = distinctUnits.size >= 3 && gridCells.length >= 6;

  const gridFloors = showGrid
    ? [...new Set(gridCells.map(c => c.floorNum))].filter(n => n > 0).sort((a, b) => b - a).slice(0, 40)
    : [];
  const gridUnits = showGrid
    ? [...distinctUnits].sort().slice(0, 22)
    : [];
  const cellMap = new Map<string, GridCell>();
  for (const c of gridCells) cellMap.set(`${c.floorNum}_${c.unit}`, c);

  const allGridPrices = gridCells.map(c => c.avgPrice).filter(p => p > 0);
  const priceMin = allGridPrices.length ? Math.min(...allGridPrices) : 0;
  const priceMax = allGridPrices.length ? Math.max(...allGridPrices) : 1;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .site-logo span { font-size: .72rem; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #1a6b3a; }
        .wrap { max-width: 900px; margin: 0 auto; padding: 0 clamp(1rem,4vw,1.75rem) 4rem; }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .9rem; font-weight: 700; color: #1a6b3a; border-left: 4px solid #1a6b3a; padding: .5rem 1rem; background: #f0fdf4; margin: 1.25rem 0 .65rem; }
        .stat4 { background: #fff; border-bottom: 1px solid #ececec; display: grid; grid-template-columns: repeat(4,1fr); }
        .stat4-cell { padding: .9rem 1.25rem; border-right: 1px solid #f0f0f0; }
        .stat4-cell:last-child { border-right: none; }
        .stat4-val { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #1a6b3a; }
        .stat4-lbl { font-size: .7rem; color: #aaa; margin-top: .15rem; }
        .box { background: #fff; border: 1px solid #d1e8d8; margin-bottom: 1px; overflow: hidden; }
        .box-head { background: #f0fdf4; padding: .5rem 1rem; border-bottom: 1px solid #d1e8d8; font-family: 'Noto Serif TC', serif; font-size: .88rem; font-weight: 700; color: #1a6b3a; display: flex; justify-content: space-between; align-items: center; }
        .box-head span { font-size: .68rem; color: #aaa; font-weight: 300; font-family: 'Noto Sans TC', sans-serif; }
        .tx-row { background: #fff; border: 1px solid #eaf5ec; display: grid; grid-template-columns: 1fr auto; }
        .tx-row:hover { background: #f0fdf4; }
        .row-body { padding: .7rem 1rem; }
        .row-meta { display: flex; flex-wrap: wrap; gap: .25rem .65rem; font-size: .72rem; color: #888; margin-top: .2rem; }
        .row-date { font-size: .65rem; color: #bbb; margin-top: .25rem; }
        .row-price { padding: .7rem 1rem; border-left: 1px solid #eaf5ec; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; min-width: 80px; flex-shrink: 0; }
        .price-big { font-family: 'Noto Serif TC', serif; font-size: 1.1rem; font-weight: 700; color: #1a6b3a; }
        .price-big small { font-size: .6rem; margin-left: 1px; }

        /* 熱圖 */
        .grid-wrap { overflow-x: auto; border: 1px solid #d1e8d8; background: #fff; margin-bottom: 1px; }
        .grid-table { border-collapse: collapse; font-size: 9px; }
        .grid-th-corner { position: sticky; left: 0; z-index: 3; background: #f0fdf4; border-bottom: 2px solid #d1e8d8; border-right: 2px solid #d1e8d8; padding: 5px 7px; color: #aaa; font-weight: 400; text-align: center; min-width: 40px; }
        .grid-th-unit { background: #f0fdf4; border-bottom: 2px solid #d1e8d8; border-right: 1px solid #d0e8d8; padding: 5px 4px; color: #555; font-weight: 500; text-align: center; min-width: 38px; max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .grid-td-floor { position: sticky; left: 0; z-index: 2; background: #f0fdf4; border-right: 2px solid #d1e8d8; border-bottom: 1px solid #e4f0e8; padding: 2px 6px; color: #555; font-weight: 500; text-align: right; white-space: nowrap; }
        .grid-td-cell { border-right: 1px solid rgba(160,210,170,.3); border-bottom: 1px solid rgba(160,210,170,.3); text-align: center; height: 26px; vertical-align: middle; transition: opacity .1s; cursor: default; }
        .grid-td-cell:hover { outline: 2px solid #1a6b3a; outline-offset: -1px; z-index: 1; position: relative; }

        @media(max-width:580px){ .stat4 { grid-template-columns: 1fr 1fr; } .row-price { display: none; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '首頁',    item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}` },
              { '@type': 'ListItem', position: 2, name: `${c}預售屋`, item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/presale/${encodeURIComponent(c)}` },
              { '@type': 'ListItem', position: 3, name: `${d}`,    item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}` },
              { '@type': 'ListItem', position: 4, name: p },
            ],
          },
          {
            '@type': 'ApartmentComplex',
            name: p,
            address: { '@type': 'PostalAddress', addressLocality: d, addressRegion: c, addressCountry: 'TW' },
            ...(avgWan ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'TWD', lowPrice: (minWan || avgWan) * 10000, highPrice: (maxWan || avgWan) * 10000, offerCount: total } } : {}),
          },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #1a6b3a' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(.8rem,3vw,1.25rem) clamp(1rem,4vw,1.75rem) clamp(1rem,3vw,1.5rem)' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/presale" className="crumb">預售屋</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href={`/presale/${encodeURIComponent(c)}`} className="crumb">{c}</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="crumb">{d}</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#444' }}>{p}</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.18em', color: '#1a6b3a', marginBottom: '.4rem' }}>PRESALE · 預售屋成交記錄</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a3a2a', marginBottom: '.5rem' }}>
            {p}
          </h1>
          <p style={{ fontSize: '.85rem', color: '#888', fontWeight: 300, lineHeight: 2, margin: 0 }}>
            {c}{d}・{stats.earliest?.slice(0,4)}～{stats.latest?.slice(0,4)} 年，共{' '}
            <strong style={{ color: '#1a6b3a' }}>{total} 筆</strong>成交
            {avgWan && <>，均價 <strong style={{ color: '#1a6b3a' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪 <strong style={{ color: '#1a6b3a' }}>{avgUnit.toFixed(1)} 萬</strong></>}
            {minWan && maxWan && minWan !== maxWan && <>，成交區間 {minWan.toLocaleString()}～{maxWan.toLocaleString()} 萬</>}
            {stats.total_floors && <>，共 {stats.total_floors} 層</>}。
          </p>
        </div>
      </div>

      {/* 統計四格 */}
      <div className="stat4">
        {[
          { label: '成交筆數', value: `${total} 筆` },
          { label: '成交均價', value: avgWan ? `${avgWan.toLocaleString()} 萬` : '—' },
          { label: '每坪均價', value: avgUnit ? `${avgUnit.toFixed(1)} 萬` : '—' },
          { label: '成交區間', value: minWan && maxWan && minWan !== maxWan ? `${minWan}～${maxWan} 萬` : avgWan ? `${avgWan} 萬` : '—' },
        ].map((s, i, arr) => (
          <div key={s.label} className="stat4-cell" style={{ borderRight: i < arr.length - 1 ? undefined : 'none' }}>
            <div className="stat4-lbl">{s.label}</div>
            <div className="stat4-val">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="wrap">

        {/* 年度走勢 */}
        {yearTrend.length >= 2 && (
          <div className="box" style={{ marginTop: '1.25rem' }}>
            <div className="box-head">年度成交均價走勢</div>
            <div style={{ padding: '.85rem 1rem .65rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 90 }}>
              {yearTrend.map((r: any) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const pct  = r.avg_price ? Math.round(Number(r.avg_price) / maxAvg * 82) + 12 : 12;
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: '.63rem', color: '#1a6b3a', fontWeight: 600 }}>{avgW ? `${avgW}萬` : '—'}</div>
                    <div style={{ width: '100%', height: `${pct}px`, background: '#1a6b3a', borderRadius: '3px 3px 0 0', opacity: .55 + .45 * (pct / 94) }} />
                    <div style={{ fontSize: '.63rem', color: '#888' }}>{r.year}</div>
                    <div style={{ fontSize: '.58rem', color: '#bbb' }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 棟別・樓層・戶別 成交熱圖 ───────────────────────────────────── */}
        {showGrid && gridFloors.length >= 2 && (
          <>
            <div className="sec-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>棟別・樓層・戶別 成交熱圖</span>
              <span style={{ fontSize: '.68rem', color: '#1a6b3a', fontWeight: 300, fontFamily: "'Noto Sans TC', sans-serif" }}>
                {gridFloors.length} 樓層 × {gridUnits.length} 戶別・數字為萬元均價
              </span>
            </div>
            <div className="grid-wrap">
              <table className="grid-table">
                <colgroup>
                  <col style={{ width: 40 }} />
                  {gridUnits.map(u => <col key={u} style={{ width: 42 }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className="grid-th-corner">樓↑</th>
                    {gridUnits.map(u => (
                      <th key={u} className="grid-th-unit" title={u}>{u}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridFloors.map(floorNum => (
                    <tr key={floorNum}>
                      <td className="grid-td-floor">{floorNum}F</td>
                      {gridUnits.map(u => {
                        const cell = cellMap.get(`${floorNum}_${u}`);
                        const bg   = gridColor(cell?.avgPrice ?? 0, priceMin, priceMax);
                        const avgW = cell ? Math.round(cell.avgPrice / 10000) : null;
                        const unitW = cell?.avgUnit ? unitSqmToWanPerPing(cell.avgUnit).toFixed(1) : null;
                        const isDark = cell ? (cell.avgPrice - priceMin) / (priceMax - priceMin + 1) > 0.62 : false;
                        const tip = cell
                          ? `${floorNum}F ${u}\n成交均價：${avgW} 萬${cell.bedrooms ? `\n格局：${cell.bedrooms}房` : ''}${unitW ? `\n單坪：${unitW} 萬/坪` : ''}\n共 ${cell.n} 筆成交`
                          : `${floorNum}F ${u}：無成交記錄`;
                        return (
                          <td key={u} className="grid-td-cell" title={tip}
                            style={{ background: bg }}>
                            {avgW !== null && (
                              <span style={{ fontSize: 8.5, fontWeight: 600, color: isDark ? '#e8f5ec' : '#1a3a2a', userSelect: 'none' }}>
                                {avgW}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 圖例 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.3rem 0 .85rem', fontSize: 9, color: '#aaa', flexWrap: 'wrap' }}>
              <span>數字 = 成交均價（萬）</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                低
                {[0.05, 0.25, 0.5, 0.75, 0.95].map(pct => (
                  <span key={pct} style={{
                    width: 18, height: 11,
                    background: gridColor(priceMin + pct * (priceMax - priceMin), priceMin, priceMax),
                    borderRadius: 2, display: 'inline-block', border: '1px solid rgba(0,0,0,.06)',
                  }} />
                ))}
                高
              </span>
              <span style={{ color: '#ccc' }}>灰白＝無成交・hover 查詳情</span>
              {gridFloors.length === 40 && <span style={{ color: '#f0a070' }}>（僅顯示最高 40 層）</span>}
            </div>
          </>
        )}

        {/* 格局分布 */}
        {layoutRows.length > 0 && (
          <>
            <div className="sec-head">格局分布</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 1, background: '#d1e8d8', marginBottom: 1 }}>
              {layoutRows.map((r: any, i: number) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                return (
                  <div key={i} style={{ background: '#fff', padding: '.75rem 1rem' }}>
                    <div style={{ fontSize: '.78rem', color: '#1a6b3a', fontWeight: 600, marginBottom: '.2rem' }}>
                      {r.bedrooms}房{r.halls ?? ''}廳
                    </div>
                    <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700, color: '#1a3a2a' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    {unitW && <div style={{ fontSize: '.68rem', color: '#aaa' }}>{unitW} 萬/坪</div>}
                    <div style={{ fontSize: '.65rem', color: '#bbb', marginTop: '.1rem' }}>{Number(r.n)} 筆</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 坪數分布 */}
        {areaBuckets.length > 0 && (
          <>
            <div className="sec-head">坪數分布</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 1, background: '#d1e8d8', marginBottom: 1 }}>
              {areaBuckets.map((r: any, i: number) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const total = areaBuckets.reduce((s: number, x: any) => s + Number(x.n), 0);
                const pct   = total > 0 ? Math.round(Number(r.n) / total * 100) : 0;
                return (
                  <div key={i} style={{ background: '#fff', padding: '.75rem 1rem' }}>
                    <div style={{ fontSize: '.78rem', color: '#1a6b3a', fontWeight: 600, marginBottom: '.2rem' }}>{r.range_label}</div>
                    <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700, color: '#1a3a2a' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    <div style={{ fontSize: '.65rem', color: '#bbb', marginTop: '.1rem' }}>{Number(r.n)} 筆・佔 {pct}%</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 樓層均價（無熱圖時顯示，有熱圖時此條更精簡） */}
        {floorRows.length >= 2 && (
          <>
            <div className="sec-head">各樓層成交均價{showGrid ? '（條列）' : ''}</div>
            <div style={{ background: '#fff', border: '1px solid #d1e8d8', padding: '.75rem 1rem', marginBottom: 1 }}>
              {floorRows.map((r: any, i: number) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const barPct = r.avg_price && maxFloorAvg > 0 ? Math.round(Number(r.avg_price) / maxFloorAvg * 100) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < floorRows.length - 1 ? 6 : 0 }}>
                    <div style={{ width: 52, fontSize: '.72rem', color: '#555', fontWeight: 500, flexShrink: 0 }}>{r.floor}</div>
                    <div style={{ flex: 1, background: '#eaf5ec', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: '#1a6b3a', borderRadius: 2 }} />
                    </div>
                    <div style={{ width: 72, fontSize: '.72rem', color: '#1a6b3a', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    {unitW && <div style={{ width: 52, fontSize: '.65rem', color: '#bbb', flexShrink: 0 }}>{unitW}/坪</div>}
                    <div style={{ width: 28, fontSize: '.62rem', color: '#ccc', flexShrink: 0 }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 所有成交記錄 */}
        <div className="sec-head">成交記錄（{total} 筆）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '2rem' }}>
          {records.map((r: any, i: number) => {
            const priceWan = r.total_price ? Math.round(Number(r.total_price) / 10000) : null;
            const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
            const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
            return (
              <div key={i} className="tx-row">
                <div className="row-body">
                  <div style={{ fontSize: '.85rem', color: '#1a3a2a', fontWeight: 500 }}>
                    {r.building_unit || r.floor ? `${r.building_unit ? r.building_unit + '・' : ''}${r.floor || ''}` : '—'}
                  </div>
                  <div className="row-meta">
                    {r.building_type && <span style={{ color: '#1a6b3a' }}>{r.building_type}</span>}
                    {areaPing && <span>建物 <strong style={{ color: '#555' }}>{areaPing}</strong> 坪</span>}
                    {r.bedrooms > 0 && <span>{r.bedrooms}房{r.halls}廳{r.bathrooms}衛</span>}
                    {r.floor && <span>{r.floor}</span>}
                    {r.elevator === '有' && <span style={{ color: '#3a7d2c' }}>電梯</span>}
                    {r.parking_price > 0 && <span>含車位</span>}
                  </div>
                  <div className="row-date">📅 成交 {r.tx_date_iso || '—'}</div>
                </div>
                <div className="row-price">
                  <div style={{ fontSize: 9, color: '#aaa' }}>成交總價</div>
                  <div className="price-big">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                  {unitWan && <div style={{ fontSize: '.68rem', color: '#aaa' }}>{unitWan}萬/坪</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 同區其他預售建案 */}
        {nearbyProjects.length > 0 && (
          <>
            <div className="sec-head">同區其他預售建案</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 1, background: '#d1e8d8', marginBottom: 1 }}>
              {nearbyProjects.map((r: any, i: number) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                return (
                  <a key={i} href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.project_name)}`}
                    style={{ background: '#fff', padding: '.75rem 1rem', textDecoration: 'none', display: 'block' }}>
                    <div style={{ fontSize: '.82rem', color: '#1a3a2a', fontWeight: 500, marginBottom: '.25rem', lineHeight: 1.4 }}>{r.project_name}</div>
                    <div style={{ fontFamily: "'Noto Serif TC',serif", fontSize: '.95rem', fontWeight: 700, color: '#1a6b3a' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    <div style={{ fontSize: '.65rem', color: '#bbb', marginTop: '.1rem' }}>{Number(r.n)} 筆成交</div>
                  </a>
                );
              })}
            </div>
          </>
        )}

        {/* 同區實價成屋行情 */}
        {districtPrice && Number(districtPrice.n) > 0 && (
          <>
            <div className="sec-head">同區實價成屋行情（近一年）</div>
            <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
              style={{ display: 'block', background: '#fff', border: '1px solid #d1e8d8', padding: '1rem 1.25rem', textDecoration: 'none', marginBottom: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
                {[
                  { label: '近一年成交', value: `${Number(districtPrice.n).toLocaleString()} 筆` },
                  { label: '成交均價', value: districtPrice.avg_price ? `${Math.round(Number(districtPrice.avg_price)/10000).toLocaleString()} 萬` : '—' },
                  { label: '每坪均價', value: districtPrice.avg_unit ? `${unitSqmToWanPerPing(Number(districtPrice.avg_unit)).toFixed(1)} 萬` : '—' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: '.68rem', color: '#aaa' }}>{s.label}</div>
                    <div style={{ fontFamily: "'Noto Serif TC',serif", fontSize: '1rem', fontWeight: 700, color: '#1a6b3a', marginTop: '.15rem' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '.7rem', color: '#1a6b3a', marginTop: '.75rem' }}>查看 {d} 完整實價登錄 →</div>
            </a>
          </>
        )}

        {/* 同區法拍物件 */}
        {nearbyAuctions.length > 0 && (
          <>
            <div className="sec-head">同區法拍物件</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '1.5rem' }}>
              {nearbyAuctions.map((r: any, i: number) => {
                const priceWan = r.price ? Math.round(Number(r.price) / 10000) : null;
                const areaPing = r.area ? Number(r.area).toFixed(1) : null;
                return (
                  <a key={i} href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(r.district || d)}/${encodeURIComponent(r.id)}`}
                    style={{ background: '#fff', border: '1px solid #f5e8e0', display: 'grid', gridTemplateColumns: '1fr auto', textDecoration: 'none' }}>
                    <div style={{ padding: '.7rem 1rem' }}>
                      <div style={{ fontSize: '.85rem', color: '#1a3a2a', fontWeight: 500 }}>{r.title || r.address || '法拍物件'}</div>
                      <div style={{ display: 'flex', gap: '.5rem .85rem', flexWrap: 'wrap', fontSize: '.7rem', color: '#888', marginTop: '.2rem' }}>
                        {r.delivery && <span style={{ color: r.delivery.includes('點交') ? '#c2632a' : '#888' }}>{r.delivery}</span>}
                        {areaPing && <span>{areaPing} 坪</span>}
                        {r.auction_date && <span>開標 {r.auction_date}</span>}
                        {r.status && <span style={{ color: r.status === '已結標' ? '#bbb' : '#555' }}>{r.status}</span>}
                      </div>
                    </div>
                    <div style={{ padding: '.7rem 1rem', borderLeft: '1px solid #f5e8e0', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: '.6rem', color: '#bbb' }}>底價</div>
                      <div style={{ fontFamily: "'Noto Serif TC',serif", fontSize: '1.05rem', fontWeight: 700, color: '#c2632a' }}>
                        {priceWan !== null ? <>{priceWan}<span style={{ fontSize: '.6rem' }}>萬</span></> : '—'}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <a href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
                style={{ display: 'inline-block', padding: '.45rem 1.25rem', background: '#fff5f0', color: '#c2632a', fontSize: '.78rem', fontWeight: 500, textDecoration: 'none', border: '1px solid #f5d5c0' }}>
                查看 {d} 全部法拍物件 →
              </a>
            </div>
          </>
        )}

        <div style={{ textAlign: 'center' }}>
          <a href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
            style={{ display: 'inline-block', padding: '.55rem 1.5rem', background: '#f0fdf4', color: '#1a6b3a', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none', border: '1px solid #d1e8d8' }}>
            ← {d} 全區預售行情
          </a>
        </div>
      </div>
    </>
  );
}
