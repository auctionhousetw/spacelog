import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string }>;

export async function generateStaticParams() {
  try {
    const rows = await prisma.$queryRawUnsafe<{ city: string }[]>(
      `SELECT DISTINCT city FROM houses WHERE city IS NOT NULL AND city != ''`
    );
    return rows.map((r: { city: string }) => ({ city: encodeURIComponent(r.city) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);
  const safeC0 = c.replace(/'/g, "''");
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as n, COUNT(DISTINCT district) as d FROM houses WHERE city='${safeC0}'`
  );
  const n = Number(rows[0]?.n || 0);
  const d = Number(rows[0]?.d || 0);
  return {
    title:       `${c}法拍屋 - ${d} 個行政區 ${n} 筆物件 | 底價查詢`,
    description: `${c}法拍屋總覽，涵蓋 ${d} 個行政區共 ${n} 筆物件。依行政區瀏覽最新開標資訊，掌握${c}法拍市場行情。`,
    alternates:  { canonical: `/auction/${city}` },
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);
  const safeC = c.replace(/'/g, "''");

  const [statsRows, districts, lvrRows, typeRows, recentRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, COUNT(DISTINCT district) as d,
              AVG(CASE WHEN price>0 THEN price END) as avg
       FROM houses WHERE city='${safeC}'`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT district,
              COUNT(*) as n,
              AVG(CASE WHEN price>0 THEN price END) as avg,
              MAX(CASE WHEN auction_date!='' THEN auction_date END) as latest
       FROM houses
       WHERE city='${safeC}' AND district IS NOT NULL AND district!=''
       GROUP BY district ORDER BY n DESC`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
       FROM lvr_land
       WHERE city='${safeC}' AND tx_type LIKE '%建物%'
         AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')`
    ).catch(() => []),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT type, COUNT(*) as n, AVG(CASE WHEN price>0 THEN price END) as avg
       FROM houses
       WHERE city='${safeC}' AND type IS NOT NULL AND type!=''
       GROUP BY type ORDER BY n DESC LIMIT 6`
    ).catch(() => []),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, city, district, address, price, type, auction_date, status
       FROM houses
       WHERE city='${safeC}' AND auction_date IS NOT NULL AND auction_date!=''
       ORDER BY auction_date DESC LIMIT 6`
    ).catch(() => []),
  ]);

  const st = statsRows[0];
  if (!st || Number(st.n) === 0) notFound();

  const total        = Number(st.n);
  const distCount    = Number(st.d);
  const avgWan       = st.avg ? Math.floor(Number(st.avg) / 10000) : null;
  const lvrAvgWan    = lvrRows[0]?.avg_price ? Math.round(Number(lvrRows[0].avg_price) / 10000) : null;
  const discountPct  = (st.avg && lvrRows[0]?.avg_price && Number(lvrRows[0].avg_price) > 0)
    ? Math.round((1 - Number(st.avg) / Number(lvrRows[0].avg_price)) * 100) : null;
  const topDistrict  = districts[0]?.district || '';
  const topType      = typeRows[0]?.type || '';

  const BASE = process.env.NEXT_PUBLIC_BASE_URL || '';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',        item: BASE },
          { '@type': 'ListItem', position: 2, name: '法拍屋',      item: `${BASE}/auction` },
          { '@type': 'ListItem', position: 3, name: `${c}法拍屋` },
        ],
      }) }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: #fafafa; margin: 0; font-family: 'Noto Sans TC', sans-serif; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 960px; margin: 0 auto; padding: 0 clamp(1rem,3vw,1.75rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .nav-link.active { color: #c2632a; font-weight: 500; }
        .city-crumb { color: #bbb; font-size: 11px; text-decoration: none; transition: color .15s; }
        .city-crumb:hover { color: #c2632a; }
        .dist-block { display:block; background:#fff; border:1px solid #ececec; border-radius:2px;
          padding:1.1rem 1.25rem; text-decoration:none; transition:border-color .15s, box-shadow .15s; }
        .dist-block:hover { border-color:#c2632a; box-shadow:0 2px 8px rgba(194,99,42,.08); }
        @media(max-width:640px){ .dist-grid{ grid-template-columns:1fr 1fr !important; } }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link active">法拍屋</a>
          <a href="/price"   className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <main style={{ minHeight: '100vh', background: '#fafafa', paddingBottom: '5rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem)' }}>

          {/* 麵包屑 */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1.1rem', fontSize: 11 }}>
            <Link href="/" className="city-crumb">首頁</Link>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <Link href="/auction" className="city-crumb">法拍屋</Link>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#888' }}>{c}</span>
          </nav>

          {/* Hero */}
          <div style={{ background: '#fff', borderTop: '1px solid #ececec', borderBottom: '1px solid #ececec',
            padding: 'clamp(1.5rem,4vw,2.5rem) clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
            <p style={{ fontSize: '.75rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a',
              fontFamily: "'Noto Sans TC', sans-serif", marginBottom: '.6rem' }}>
              LAW · 法拍屋資訊平台
            </p>
            <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.4rem,4vw,2rem)',
              fontWeight: 700, color: '#222', lineHeight: 1.5, marginBottom: '.75rem' }}>
              {c}法拍屋
            </h1>
            <p style={{ fontSize: '.9rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
              {c}共 <strong style={{ color: '#c2632a', fontWeight: 600 }}>{distCount}</strong> 個行政區、
              <strong style={{ color: '#c2632a', fontWeight: 600 }}>{total.toLocaleString()}</strong> 筆法拍物件
              {avgWan && <>，法拍底價均約 <strong style={{ color: '#c2632a', fontWeight: 600 }}>{avgWan.toLocaleString()} 萬</strong></>}
              {lvrAvgWan && discountPct !== null && discountPct > 0 && (
                <>，相較於近兩年實際成交均價 <strong style={{ color: '#2a5298', fontWeight: 600 }}>{lvrAvgWan.toLocaleString()} 萬</strong>，底價平均低 <strong style={{ color: '#3a7d2c', fontWeight: 600 }}>{discountPct}%</strong></>
              )}
              。依行政區查看最新開標日期與底價。
            </p>
          </div>

          {/* 行政區卡片 */}
          <div style={{ padding: '1.5rem 0 .5rem' }}>
            <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700,
              color: '#c2632a', borderLeft: '4px solid #c2632a', padding: '.6rem 1rem',
              background: '#fff8f4', marginBottom: '1rem' }}>
              依行政區瀏覽
            </h2>
            <div className="dist-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {districts.map((r: any) => {
                const distAvg = r.avg ? Math.floor(Number(r.avg) / 10000) : null;
                return (
                  <Link key={r.district}
                    href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(r.district)}`}
                    className="dist-block">
                    <div style={{ fontSize: '.925rem', fontWeight: 600, color: '#333',
                      fontFamily: "'Noto Serif TC', serif", marginBottom: '.4rem' }}>
                      {r.district}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: '#aaa' }}>
                      <span>{Number(r.n)} 筆</span>
                      {distAvg && <span style={{ color: '#c2632a', fontWeight: 500 }}>均 {distAvg.toLocaleString()} 萬</span>}
                    </div>
                    {r.latest && (
                      <div style={{ fontSize: '.72rem', color: '#ccc', marginTop: '.3rem' }}>
                        最近開標 {r.latest}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 查看全部 */}
          <div style={{ textAlign: 'center', marginTop: '2rem', marginBottom: '1.5rem' }}>
            <Link href={`/auction?city=${encodeURIComponent(c)}&sort=date`}
              style={{ display: 'inline-block', padding: '.65rem 2rem', background: '#c2632a', color: '#fff',
                fontSize: '.875rem', fontWeight: 500, borderRadius: 2, textDecoration: 'none',
                fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: '.06em' }}>
              查看 {c} 全部 {total.toLocaleString()} 筆物件 →
            </Link>
          </div>

          {/* 建物類型分布 */}
          {typeRows.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700,
                color: '#c2632a', borderLeft: '4px solid #c2632a', padding: '.6rem 1rem',
                background: '#fff8f4', marginBottom: '1rem' }}>
                法拍建物類型分布
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {typeRows.map((r: any) => {
                  const pct = Math.round(Number(r.n) / total * 100);
                  const typeAvg = r.avg ? Math.floor(Number(r.avg) / 10000) : null;
                  return (
                    <div key={r.type} style={{ background: '#fff', border: '1px solid #ececec',
                      borderRadius: 2, padding: '1rem 1.1rem' }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 600, color: '#333', marginBottom: '.4rem' }}>
                        {r.type}
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{Number(r.n).toLocaleString()} 筆（{pct}%）</span>
                        {typeAvg && <span style={{ color: '#c2632a', fontWeight: 500 }}>均 {typeAvg.toLocaleString()} 萬</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 最新開標物件 */}
          {recentRows.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700,
                color: '#c2632a', borderLeft: '4px solid #c2632a', padding: '.6rem 1rem',
                background: '#fff8f4', marginBottom: '1rem' }}>
                最新開標物件
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentRows.map((r: any) => {
                  const priceWan = r.price ? Math.floor(Number(r.price) / 10000) : null;
                  return (
                    <Link key={r.id}
                      href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(r.district || '')}/${r.id}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#fff', border: '1px solid #ececec', borderRadius: 2,
                        padding: '.8rem 1.1rem', textDecoration: 'none',
                        transition: 'border-color .15s' }}>
                      <div>
                        <span style={{ fontSize: '.78rem', color: '#aaa', marginRight: 8 }}>{r.district}</span>
                        <span style={{ fontSize: '.85rem', color: '#333', fontWeight: 500 }}>
                          {r.address || r.type || '法拍物件'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                        {priceWan && (
                          <span style={{ fontSize: '.85rem', fontWeight: 600, color: '#c2632a' }}>
                            {priceWan.toLocaleString()} 萬
                          </span>
                        )}
                        <span style={{ fontSize: '.72rem', color: '#ccc' }}>{r.auction_date}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* 市場解讀段落 */}
          <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 2,
            padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700,
              color: '#333', marginBottom: '1rem' }}>
              {c}法拍市場概況
            </h2>
            <p style={{ fontSize: '.875rem', color: '#555', lineHeight: 2, margin: 0 }}>
              {c}目前共有 <strong>{total.toLocaleString()}</strong> 筆法拍物件，涵蓋 <strong>{distCount}</strong> 個行政區。
              {topDistrict && <>以 <strong>{topDistrict}</strong> 物件量最多，</>}
              {topType && <>建物類型以<strong>{topType}</strong>為主。</>}
              {avgWan && <>整體法拍底價均約 <strong>{avgWan.toLocaleString()} 萬元</strong>。</>}
              {lvrAvgWan && discountPct !== null && discountPct > 0 && (
                <>相較於近兩年實際成交均價 <strong>{lvrAvgWan.toLocaleString()} 萬元</strong>，法拍底價平均約低 <strong>{discountPct}%</strong>，對具備看屋與評估能力的買方而言，具有一定的議價空間。</>
              )}
              {' '}法拍屋因涉及點交、清空、查封等法律程序，建議投標前詳閱法院公告，並評估相關風險後再行決定。
            </p>
          </div>

          {/* 同縣市預售屋入口 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #d1e8d8', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#1a6b3a' }}>
                {c} 預售屋成交行情
              </div>
              <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.2rem' }}>查看 {c} 各行政區建案成交記錄與均價走勢</div>
            </div>
            <Link href={`/presale/${encodeURIComponent(c)}`}
              style={{ flexShrink: 0, padding: '.45rem 1rem', background: '#1a6b3a', color: '#fff', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', borderRadius: 2, fontFamily: "'Noto Sans TC', sans-serif", whiteSpace: 'nowrap' }}>
              查看預售屋 →
            </Link>
          </div>

          <div style={{ background: '#fff8f4', borderLeft: '4px solid #c2632a',
            borderTop: '1px solid #f0c4a0', borderBottom: '1px solid #f0c4a0',
            padding: '1.25rem clamp(1.25rem,4vw,2rem)' }}>
            <p style={{ fontSize: '.8rem', color: '#b07340', fontWeight: 300, lineHeight: 2, margin: 0 }}>
              本平台資料僅供參考，一切以法院或執行單位公告為準。投標前請至司法院官網確認最新底價與開標資訊。
            </p>
          </div>

        </div>
      </main>
    </>
  );
}
