import { notFound } from 'next/navigation';
import prismaLvr from '@/lib/prisma-lvr';

type Params = Promise<{ city: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);
  return {
    title: `${c}實價登錄查詢 | 各行政區成交行情`,
    description: `${c}房屋、土地實際成交價格，依行政區查詢最新成交記錄與均價。`,
    alternates: { canonical: `/price/${city}` },
  };
}

export default async function LvrCityPage({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);

  let districts: any[] = [];
  let cityStats: any = null;

  const safeC = c.replace(/'/g, "''");
  try {
    const [statsRows, distRows] = await Promise.all([
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price > 0 AND tx_type LIKE '%建物%' THEN total_price END) as avg_build,
                MAX(tx_date_iso) as latest
         FROM lvr_land WHERE city = '${safeC}'`
      ),
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT district,
                COUNT(*) as n,
                COUNT(CASE WHEN tx_type LIKE '%建物%' THEN 1 END) as n_build,
                AVG(CASE WHEN total_price > 0 AND tx_type LIKE '%建物%' THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm > 0 AND tx_type LIKE '%建物%' THEN unit_price_sqm END) as avg_unit,
                MAX(tx_date_iso) as latest
         FROM lvr_land
         WHERE city = '${safeC}' AND district IS NOT NULL AND district != ''
         GROUP BY district
         ORDER BY n DESC`
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    cityStats = statsRows[0];
    districts = distRows;
  } catch (e: any) {
    if (e?.message?.startsWith('NEXT_')) throw e;
    notFound();
  }

  const total   = Number(cityStats.n);
  const avgWan  = cityStats.avg_build ? Math.round(Number(cityStats.avg_build) / 10000) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: #f7f6f3; margin: 0; font-family: 'Noto Sans TC', sans-serif; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1.5rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; font-family: 'Noto Sans TC', sans-serif; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .nav-link.blue { color: #2a5298; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; transition: color .15s; }
        .crumb:hover { color: #2a5298; }
        .dist-card { display: block; background: #fff; border: 1px solid #e0e8f8; padding: 1.1rem 1.25rem; text-decoration: none; color: inherit; transition: border-color .15s, box-shadow .15s; }
        .dist-card:hover { border-color: #2a5298; box-shadow: 0 2px 8px rgba(42,82,152,.1); }
        .dist-name { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 600; color: #1e3a6e; margin-bottom: .4rem; }
        .dist-row { display: flex; justify-content: space-between; font-size: .78rem; }
        .dist-n { color: #2a5298; }
        .dist-avg { color: #c2632a; font-weight: 500; }
        .dist-unit { font-size: .72rem; color: #aaa; font-weight: 300; margin-top: .2rem; }
        .dist-latest { font-size: .7rem; color: #ccc; font-weight: 300; margin-top: .15rem; }
        @media(max-width:640px){ .dist-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link blue">實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <main style={{ minHeight: '100vh', paddingBottom: '5rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem)' }}>

          {/* 麵包屑 */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1.1rem', fontSize: 11 }}>
            <a href="/" className="crumb">首頁</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href="/price" className="crumb">實價登錄</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#888' }}>{c}</span>
          </nav>

          {/* Hero */}
          <div style={{ background: '#fff', borderTop: '3px solid #2a5298', padding: 'clamp(1.5rem,4vw,2.5rem) clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
            <p style={{ fontSize: '.75rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.6rem' }}>
              REAL PRICE REGISTRATION · 實價登錄
            </p>
            <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 700, color: '#1e3a6e', lineHeight: 1.5, marginBottom: '.75rem' }}>
              {c} 實價登錄
            </h1>
            <p style={{ fontSize: '.9rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
              共 <strong style={{ color: '#2a5298' }}>{total.toLocaleString()}</strong> 筆成交記錄，
              涵蓋 <strong style={{ color: '#2a5298' }}>{districts.length}</strong> 個行政區。
              {avgWan ? `建物均價約 ${avgWan.toLocaleString()} 萬。` : ''}
            </p>
          </div>

          {/* 行政區卡片 */}
          <div style={{ padding: '1.75rem 0 .5rem' }}>
            <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700, color: '#2a5298', borderLeft: '4px solid #2a5298', padding: '.6rem 1rem', background: '#f0f5ff', marginBottom: '1rem' }}>
              依行政區查詢
            </h2>
            <div className="dist-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {districts.map((r: any) => {
                const distAvg = r.avg ? Math.round(Number(r.avg) / 10000) : null;
                const unitWan = r.avg_unit ? (Number(r.avg_unit) / 10000).toFixed(2) : null;
                return (
                  <a key={r.district}
                    href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(r.district)}`}
                    className="dist-card">
                    <div className="dist-name">{r.district}</div>
                    <div className="dist-row">
                      <span className="dist-n">{Number(r.n).toLocaleString()} 筆</span>
                      {distAvg && <span className="dist-avg">均 {distAvg.toLocaleString()} 萬</span>}
                    </div>
                    {unitWan && <div className="dist-unit">{unitWan} 萬/㎡</div>}
                    {r.latest && <div className="dist-latest">最近成交 {r.latest}</div>}
                  </a>
                );
              })}
            </div>
          </div>

          <div style={{ textAlign: 'center', margin: '2rem 0' }}>
            <a href={`/price/${encodeURIComponent(c)}/全區`}
              style={{ display: 'inline-block', padding: '.65rem 2rem', background: '#2a5298', color: '#fff', fontSize: '.875rem', fontWeight: 500, textDecoration: 'none', letterSpacing: '.06em' }}>
              查看 {c} 全部 {total.toLocaleString()} 筆記錄 →
            </a>
          </div>

        </div>
      </main>
    </>
  );
}
