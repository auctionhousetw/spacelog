import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string }>;

const unitSqmToWanPerPing = (u: number) => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  let n = 0, avg = 0, projects = 0;
  try {
    const safeC0 = c.replace(/'/g, "''");
    const safeD0 = d.replace(/'/g, "''");
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
              COUNT(DISTINCT project_name) as projects
       FROM lvr_presale WHERE city='${safeC0}' AND district='${safeD0}'`
    );
    n = Number(rows[0]?.n || 0);
    avg = rows[0]?.avg ? Math.round(Number(rows[0].avg) / 10000) : 0;
    projects = Number(rows[0]?.projects || 0);
  } catch { /* ignore */ }
  return {
    title: `${c}${d}預售屋成交 | ${projects} 個建案 ${n} 筆成交`,
    description: `${c}${d}預售屋共 ${projects} 個建案、${n} 筆成交記錄${avg ? `，均價約 ${avg} 萬` : ''}。依建案查詢成交均價、坪數與格局。`,
    alternates: { canonical: `/presale/${city}/${district}` },
  };
}

export default async function PresaleDistrictPage({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  let distStats: any = null;
  let projects: any[] = [];
  let yearTrend: any[] = [];

  try {
    const [statsRows, projectRows, trendRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                COUNT(DISTINCT project_name) as projects,
                MAX(tx_date_iso) as latest, MIN(tx_date_iso) as earliest
         FROM lvr_presale WHERE city='${safeC}' AND district='${safeD}'`
      ),
      // 按建案分組
      prisma.$queryRawUnsafe<any[]>(
        `SELECT project_name,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                MIN(CASE WHEN total_price>0 THEN total_price END) as min_p,
                MAX(CASE WHEN total_price>0 THEN total_price END) as max_p,
                MAX(tx_date_iso) as latest,
                STRING_AGG(DISTINCT building_type, ',') as types,
                AVG(area_sqm) as avg_area
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}'
           AND project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name
         ORDER BY latest DESC, n DESC`
      ),
      // 年度走勢
      prisma.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_presale
         WHERE city='${safeC}' AND district='${safeD}' AND total_price > 0
           AND tx_date_iso IS NOT NULL
         GROUP BY SUBSTRING(tx_date_iso, 1, 4) ORDER BY 1`
      ),
    ]);
    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    distStats = statsRows[0];
    projects  = projectRows;
    yearTrend = trendRows;
  } catch { notFound(); }

  const total    = Number(distStats.n);
  const avgWan   = distStats.avg ? Math.round(Number(distStats.avg) / 10000) : null;
  const avgUnit  = distStats.avg_unit ? unitSqmToWanPerPing(Number(distStats.avg_unit)) : null;
  const maxAvg   = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;

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
        .hero { background: #fff; border-bottom: 1px solid #ececec; }
        .hero-inner { max-width: 960px; margin: 0 auto; padding: clamp(1rem,3vw,1.75rem); }
        .stat-row { background: #fff; border-bottom: 1px solid #ececec; display: grid; grid-template-columns: repeat(4,1fr); max-width: 960px; margin: 0 auto; }
        .stat-cell { padding: .9rem 1.5rem; border-right: 1px solid #f0f0f0; }
        .stat-cell:last-child { border-right: none; }
        .stat-val { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #1a6b3a; }
        .stat-lbl { font-size: .7rem; color: #aaa; margin-top: .15rem; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,3vw,2rem) clamp(1rem,3vw,1.75rem); }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #1a6b3a; border-left: 4px solid #1a6b3a; padding: .5rem 1rem; background: #f0fdf4; margin-bottom: .75rem; }
        .proj-list { display: flex; flex-direction: column; gap: 6px; }
        .proj-card { background: #fff; border: 1px solid #d1e8d8; display: grid; grid-template-columns: 1fr auto; text-decoration: none; color: inherit; transition: all .15s; }
        .proj-card:hover { border-color: #1a6b3a; box-shadow: 0 2px 8px rgba(26,107,58,.08); }
        .proj-body { padding: .85rem 1rem; }
        .proj-name { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #1a3a2a; margin-bottom: .3rem; }
        .proj-meta { display: flex; flex-wrap: wrap; gap: .3rem .75rem; font-size: .72rem; color: #888; }
        .proj-date { font-size: .68rem; color: #bbb; margin-top: .25rem; }
        .proj-price { padding: .85rem 1rem; border-left: 1px solid #eaf5ec; min-width: 90px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; flex-shrink: 0; }
        .price-big { font-family: 'Noto Serif TC', serif; font-size: 1.15rem; font-weight: 700; color: #1a6b3a; }
        .price-big small { font-size: .62rem; color: #1a6b3a; margin-left: 1px; }
        .price-unit { font-size: .7rem; color: #aaa; }
        @media(max-width:600px){ .stat-row { grid-template-columns: 1fr 1fr; } .proj-price { display: none; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',      item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '預售屋',    item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/presale` },
          { '@type': 'ListItem', position: 3, name: `${c}預售屋`, item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/presale/${encodeURIComponent(c)}` },
          { '@type': 'ListItem', position: 4, name: `${c}${d}預售屋` },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/price"   className="nav-link">實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <div className="hero">
        <div className="hero-inner">
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/presale" className="crumb">預售屋</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href={`/presale/${encodeURIComponent(c)}`} className="crumb">{c}</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#444' }}>{d}</span>
          </nav>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.7rem)', fontWeight: 700, color: '#1a3a2a', marginBottom: '.5rem' }}>
            {c}{d} 預售屋成交
          </h1>
          <p style={{ fontSize: '.85rem', color: '#888', fontWeight: 300, lineHeight: 2, margin: 0 }}>
            {distStats.earliest?.slice(0,4)}～{distStats.latest?.slice(0,4)} 年，共{' '}
            <strong style={{ color: '#1a6b3a' }}>{total.toLocaleString()} 筆</strong>成交・
            <strong style={{ color: '#1a6b3a' }}>{Number(distStats.projects)} 個</strong>建案
            {avgWan && <>，均價 <strong style={{ color: '#1a6b3a' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪 <strong style={{ color: '#1a6b3a' }}>{avgUnit.toFixed(1)} 萬</strong></>}。
          </p>
        </div>
      </div>

      <div className="stat-row">
        {[
          { label: '成交筆數',   value: `${total.toLocaleString()} 筆` },
          { label: '建案數',     value: `${Number(distStats.projects)} 個` },
          { label: '成交均價',   value: avgWan ? `${avgWan.toLocaleString()} 萬` : '—' },
          { label: '每坪均價',   value: avgUnit ? `${avgUnit.toFixed(1)} 萬` : '—' },
        ].map((s, i, arr) => (
          <div key={s.label} className="stat-cell" style={{ borderRight: i < arr.length - 1 ? undefined : 'none' }}>
            <div className="stat-lbl">{s.label}</div>
            <div className="stat-val">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="wrap">

        {/* 年度走勢 */}
        {yearTrend.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid #d1e8d8', marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '.55rem 1rem', borderBottom: '1px solid #d1e8d8', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#1a6b3a' }}>年度成交均價走勢</span>
              <span style={{ fontSize: '.7rem', color: '#aaa' }}>{yearTrend[0]?.year}～{yearTrend[yearTrend.length-1]?.year}</span>
            </div>
            <div style={{ padding: '.85rem 1rem .65rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 90 }}>
              {yearTrend.map((r: any) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const pct  = r.avg_price ? Math.round(Number(r.avg_price) / maxAvg * 82) + 12 : 12;
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: '.65rem', color: '#1a6b3a', fontWeight: 600 }}>{avgW ? `${avgW}萬` : '—'}</div>
                    <div style={{ width: '100%', height: `${pct}px`, background: '#1a6b3a', borderRadius: '3px 3px 0 0', opacity: .6 + .4 * (pct / 94) }} />
                    <div style={{ fontSize: '.65rem', color: '#888' }}>{r.year}</div>
                    <div style={{ fontSize: '.6rem', color: '#bbb' }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 建案列表 */}
        <div className="sec-head">
          {d} 預售建案（{projects.length} 個）
        </div>
        <div className="proj-list">
          {projects.map((r: any) => {
            const avgW  = r.avg ? Math.round(Number(r.avg) / 10000) : null;
            const unitW = r.avg_unit ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
            const minW  = r.min_p ? Math.round(Number(r.min_p) / 10000) : null;
            const maxW  = r.max_p ? Math.round(Number(r.max_p) / 10000) : null;
            const href  = `/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.project_name)}`;
            return (
              <a key={r.project_name} href={href} className="proj-card">
                <div className="proj-body">
                  <div className="proj-name">{r.project_name}</div>
                  <div className="proj-meta">
                    <span style={{ color: '#1a6b3a' }}>{Number(r.n)} 筆成交</span>
                    {r.types && <span>{r.types.split(',')[0]}</span>}
                    {minW && maxW && minW !== maxW && <span>成交區間 {minW.toLocaleString()}～{maxW.toLocaleString()} 萬</span>}
                  </div>
                  <div className="proj-date">最新成交：{r.latest || '—'}</div>
                </div>
                <div className="proj-price">
                  <div style={{ fontSize: 9, color: '#aaa', marginBottom: '.2rem' }}>成交均價</div>
                  <div className="price-big">{avgW ? <>{avgW}<small>萬</small></> : '—'}</div>
                  {unitW && <div className="price-unit">{unitW} 萬/坪</div>}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
