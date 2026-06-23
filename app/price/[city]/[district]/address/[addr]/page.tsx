export const revalidate = 86400;
﻿import { notFound } from 'next/navigation';
import prismaLvr from '@/lib/prisma-lvr';

type Params = Promise<{ city: string; district: string; addr: string }>;

const sqmToPing           = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number)   => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district, addr } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const a = decodeURIComponent(addr);   // building address up to 號

  let n = 0, avg = 0;
  try {
    const strip = (addr: string) => {
      let s = addr;
      for (const cv of [c, c.replace(/^台/, '臺'), c.replace(/^臺/, '台')]) {
        if (s.startsWith(cv)) { s = s.slice(cv.length); break; }
      }
      if (s.startsWith(d)) s = s.slice(d.length);
      return s || addr;
    };
    const shortA = strip(a).replace(/'/g, "''").replace(/%/g, '\\%');
    const rows = await prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg
       FROM lvr_land WHERE city='${c.replace(/'/g, "''")}' AND district='${d.replace(/'/g, "''")}' AND address LIKE '%${shortA}%' AND tx_type LIKE '%建物%'`
    );
    n   = Number(rows[0]?.n || 0);
    avg = rows[0]?.avg ? Math.round(Number(rows[0].avg) / 10000) : 0;
  } catch { /* ignore */ }

  return {
    title: `${a} 實價登錄 | 歷年成交記錄`,
    description: `${c}${d}${a}共 ${n} 筆歷年成交記錄${avg ? `，成交均價 ${avg} 萬` : ''}。查看此棟大樓各樓層實際成交價格與走勢。`,
    alternates: { canonical: `/price/${city}/${district}/address/${addr}` },
  };
}

export default async function PriceAddressPage({ params }: { params: Params }) {
  const { city, district, addr } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const a = decodeURIComponent(addr);

  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  // 剝掉地址開頭的縣市+行政區前綴（台/臺 兩字形）
  const stripPrefix = (addr: string): string => {
    let s = addr;
    for (const cv of [c, c.replace(/^台/, '臺'), c.replace(/^臺/, '台')]) {
      if (s.startsWith(cv)) { s = s.slice(cv.length); break; }
    }
    if (s.startsWith(d)) s = s.slice(d.length);
    return s || addr;
  };
  const safeA = stripPrefix(a).replace(/'/g, "''");

  let records: any[] = [], stats: any = null, yearTrend: any[] = [];

  try {
    const [fetched, statsRows, trendRows] = await Promise.all([
      // 所有同門牌號成交（依日期倒序）
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND address LIKE '%${safeA}%'
           AND tx_type LIKE '%建物%' AND total_price > 0
         ORDER BY tx_date_iso DESC, address ASC
         LIMIT 200`
      ),
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MAX(CASE WHEN total_price>0 THEN total_price END) as max_p,
                MIN(CASE WHEN total_price>0 THEN total_price END) as min_p,
                MAX(tx_date_iso) as latest,
                MIN(tx_date_iso) as earliest
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND address LIKE '%${safeA}%' AND tx_type LIKE '%建物%' AND total_price > 0`
      ),
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}'
           AND address LIKE '%${safeA}%' AND tx_type LIKE '%建物%' AND total_price > 0
         GROUP BY SUBSTRING(tx_date_iso, 1, 4) ORDER BY 1`
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    records   = fetched;
    stats     = statsRows[0];
    yearTrend = trendRows;
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const totalCount = Number(stats.n);
  const avgWan     = stats.avg  ? Math.round(Number(stats.avg) / 10000) : null;
  const avgUnit    = stats.avg_unit ? unitSqmToWanPerPing(Number(stats.avg_unit)) : null;
  const maxWan     = stats.max_p ? Math.round(Number(stats.max_p) / 10000) : null;
  const minWan     = stats.min_p ? Math.round(Number(stats.min_p) / 10000) : null;
  const maxAvg     = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;

  // 漲幅計算
  const firstYear = yearTrend[0];
  const lastYear  = yearTrend[yearTrend.length - 1];
  const change    = (firstYear?.avg_price && lastYear?.avg_price && firstYear.year !== lastYear.year)
    ? Math.round((Number(lastYear.avg_price) - Number(firstYear.avg_price)) / Number(firstYear.avg_price) * 100)
    : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .tx-row { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 1fr auto; }
        .tx-row:hover { background: #fafbff; }
        .row-body { padding: .75rem 1rem; min-width: 0; }
        .row-addr { font-size: .85rem; color: #444; font-weight: 500; margin-bottom: .2rem; }
        .row-meta { display: flex; flex-wrap: wrap; gap: .35rem .85rem; font-size: .72rem; color: #999; }
        .row-date { font-size: .68rem; color: #bbb; margin-top: .3rem; }
        .row-price { padding: .75rem 1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #f0f5ff; min-width: 90px; flex-shrink: 0; gap: .2rem; }
        .price-big { font-family: 'Noto Serif TC', serif; font-size: 1.2rem; font-weight: 700; color: #2a5298; }
        .price-big small { font-size: .65rem; color: #2a5298; margin-left: 1px; }
        @media(max-width:580px) { .row-price { display: none; } }
      `}</style>

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
          <a href="/price" className="crumb">實價登錄</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}`} className="crumb">{c}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="crumb">{d}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#2a5298', fontWeight: 500 }}>{a}</span>
        </nav>

        {/* Hero */}
        <div style={{ background: '#fff', borderTop: '3px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.18em', color: '#2a5298', marginBottom: '.5rem' }}>
            同棟成交歷史 · 實價登錄
          </p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1e3a6e', lineHeight: 1.55, marginBottom: '.6rem' }}>
            {a} 歷年成交記錄
          </h1>
          <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            {stats.earliest?.slice(0,4)} 年至 {stats.latest?.slice(0,4)} 年，共{' '}
            <strong style={{ color: '#2a5298' }}>{totalCount}</strong> 筆成交記錄
            {avgWan && <>，均價 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬</strong></>}
            {minWan && maxWan && minWan !== maxWan && <>，成交區間 {minWan.toLocaleString()}～{maxWan.toLocaleString()} 萬</>}
            {change !== null && <>，{stats.earliest?.slice(0,4)}年至今
              <strong style={{ color: change >= 0 ? '#c2632a' : '#3a7d2c', margin: '0 3px' }}>
                {change >= 0 ? `漲 ${change}%` : `跌 ${Math.abs(change)}%`}
              </strong>
            </>}。
          </p>
        </div>

        {/* 年度走勢 */}
        {yearTrend.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginTop: 1, marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#2a5298' }}>
                此棟歷年成交走勢
              </span>
              <span style={{ fontSize: '.7rem', color: '#8aabdf' }}>
                {yearTrend[0]?.year}～{yearTrend[yearTrend.length - 1]?.year}
              </span>
            </div>
            <div style={{ padding: '1rem 1rem .75rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 100 }}>
              {yearTrend.map((r: any) => {
                const avgW  = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit  ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const pct   = r.avg_price ? Math.round((Number(r.avg_price) / maxAvg) * 82) + 12 : 12;
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

        {/* 成交列表標題 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '.75rem' }}>
          <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
            全部成交記錄（{totalCount} 筆）
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: '#aaa' }}>依成交日期 新→舊</span>
        </div>

        {/* 成交列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '2rem' }}>
          {records.map((r: any, i: number) => {
            const priceWan = r.total_price ? Math.round(Number(r.total_price) / 10000) : null;
            const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
            const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
            // 提取樓層資訊（地址中 號 之後的部分）
            const floorPart = r.address?.includes('號')
              ? r.address.substring(r.address.indexOf('號') + 1).trim()
              : '';
            return (
              <div key={`${r.id}-${i}`} className="tx-row">
                <div className="row-body">
                  <div className="row-addr">
                    {floorPart ? (
                      <>
                        <span style={{ color: '#2a5298', fontWeight: 600 }}>{floorPart}</span>
                        <span style={{ color: '#aaa', fontSize: '.78rem', marginLeft: 6 }}>（{r.address}）</span>
                      </>
                    ) : r.address}
                  </div>
                  <div className="row-meta">
                    {r.building_type && <span style={{ color: '#6b8cc7' }}>{r.building_type}</span>}
                    {areaPing && <span>建物 <strong style={{ color: '#555' }}>{areaPing}</strong> 坪</span>}
                    {r.bedrooms > 0 && <span>{r.bedrooms}房{r.halls}廳{r.bathrooms}衛</span>}
                    {r.elevator === '有' && <span style={{ color: '#3a7d2c' }}>電梯</span>}
                    {r.build_complete && <span>屋齡 {r.build_complete}</span>}
                  </div>
                  <div className="row-date">📅 成交日 {r.tx_date_iso || r.tx_date || '—'}</div>
                </div>
                <div className="row-price">
                  <div style={{ fontSize: 9, color: '#aaa', letterSpacing: '.06em' }}>成交總價</div>
                  <div className="price-big">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                  {unitWan && <div style={{ fontSize: '.7rem', color: '#aaa' }}>{unitWan}萬/坪</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 返回行政區 */}
        <div style={{ textAlign: 'center', paddingBottom: '2rem' }}>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
            style={{ display: 'inline-block', padding: '.55rem 1.5rem', background: '#f0f5ff', color: '#2a5298', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none', border: '1px solid #b8d0f0' }}>
            ← {d} 全區行情
          </a>
        </div>

      </main>
    </>
  );
}
