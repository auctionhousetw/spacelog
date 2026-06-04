import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);
  return {
    title: `${c}預售屋成交行情 | 各行政區建案實價登錄`,
    description: `${c}預售屋成交記錄，依行政區與建案查詢。掌握${c}新建案均價、坪數與格局分布。`,
    alternates: { canonical: `/presale/${city}` },
  };
}

const unitSqmToWanPerPing = (u: number) => (u * 3.30579) / 10000;

export default async function PresaleCityPage({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);

  let districts: any[] = [], cityStats: any = null;

  try {
    const [statsRows, distRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                COUNT(DISTINCT project_name) as projects,
                MAX(tx_date_iso) as latest
         FROM lvr_presale WHERE city=?`, c
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT district,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
                COUNT(DISTINCT project_name) as projects,
                MAX(tx_date_iso) as latest
         FROM lvr_presale
         WHERE city=? AND district IS NOT NULL AND district != ''
         GROUP BY district ORDER BY n DESC`, c
      ),
    ]);
    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    cityStats = statsRows[0];
    districts = distRows;
  } catch { notFound(); }

  const total    = Number(cityStats.n);
  const avgWan   = cityStats.avg ? Math.round(Number(cityStats.avg) / 10000) : null;
  const avgUnit  = cityStats.avg_unit ? unitSqmToWanPerPing(Number(cityStats.avg_unit)) : null;
  const projects = Number(cityStats.projects);

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
        .hero-inner { max-width: 960px; margin: 0 auto; padding: clamp(1rem,3vw,1.75rem) clamp(1rem,3vw,1.75rem) clamp(1.25rem,3vw,2rem); }
        .stat-grid { background: #fff; border-bottom: 1px solid #ececec; display: grid; grid-template-columns: repeat(4,1fr); max-width: 960px; margin: 0 auto; }
        .stat-cell { padding: 1rem 1.5rem; border-right: 1px solid #f0f0f0; }
        .stat-cell:last-child { border-right: none; }
        .stat-val { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #1a6b3a; }
        .stat-lbl { font-size: .72rem; color: #aaa; margin-top: .2rem; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.5rem,4vw,2rem) clamp(1rem,3vw,1.75rem); }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #1a6b3a; border-left: 4px solid #1a6b3a; padding: .55rem 1rem; background: #f0fdf4; margin-bottom: .75rem; }
        .dist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
        .dist-card { display: block; background: #fff; border: 1px solid #d1e8d8; padding: 1rem 1.25rem; text-decoration: none; color: inherit; transition: all .15s; }
        .dist-card:hover { border-color: #1a6b3a; box-shadow: 0 2px 8px rgba(26,107,58,.1); }
        .dist-name { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #1a6b3a; margin-bottom: .3rem; }
        .dist-n { font-size: .75rem; color: #2a8a4a; }
        .dist-avg { font-size: .82rem; color: #c2632a; font-weight: 500; margin-top: .2rem; }
        .dist-proj { font-size: .68rem; color: #bbb; margin-top: .1rem; }
        @media(max-width:600px){ .stat-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',    item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '預售屋',  item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/presale` },
          { '@type': 'ListItem', position: 3, name: `${c}預售屋` },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/price"   className="nav-link">實價登錄</a>
        </div>
      </header>

      <div className="hero">
        <div className="hero-inner">
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <a href="/presale" className="crumb">預售屋</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#444' }}>{c}</span>
          </nav>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.8rem)', fontWeight: 700, color: '#1a3a2a', marginBottom: '.6rem' }}>
            {c} 預售屋成交行情
          </h1>
          <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 2, margin: 0 }}>
            共 <strong style={{ color: '#1a6b3a' }}>{total.toLocaleString()} 筆</strong>預售成交記錄，
            {projects} 個建案
            {avgWan && <>，成交均價約 <strong style={{ color: '#1a6b3a' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪均價 <strong style={{ color: '#1a6b3a' }}>{avgUnit.toFixed(1)} 萬</strong></>}。
          </p>
        </div>
      </div>

      <div className="stat-grid">
        {[
          { label: '成交筆數',  value: `${total.toLocaleString()} 筆` },
          { label: '建案數',    value: `${projects} 個` },
          { label: '成交均價',  value: avgWan ? `${avgWan.toLocaleString()} 萬` : '—' },
          { label: '每坪均價',  value: avgUnit ? `${avgUnit.toFixed(1)} 萬` : '—' },
        ].map((s, i, arr) => (
          <div key={s.label} className="stat-cell" style={{ borderRight: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
            <div className="stat-lbl">{s.label}</div>
            <div className="stat-val">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="wrap">
        <div className="sec-head">依行政區瀏覽</div>
        <div className="dist-grid">
          {districts.map((r: any) => {
            const distAvg  = r.avg ? Math.round(Number(r.avg) / 10000) : null;
            const distUnit = r.avg_unit ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
            return (
              <a key={r.district} href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(r.district)}`} className="dist-card">
                <div className="dist-name">{r.district}</div>
                <div className="dist-n">{Number(r.n).toLocaleString()} 筆 · {Number(r.projects)} 個建案</div>
                {distAvg && <div className="dist-avg">均價 {distAvg.toLocaleString()} 萬</div>}
                {distUnit && <div className="dist-proj">{distUnit} 萬/坪</div>}
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
