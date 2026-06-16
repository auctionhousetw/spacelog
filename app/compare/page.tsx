import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

export const metadata = {
  title: '行政區行情比較 | 全台房地產資訊平台',
  description: '比較各縣市行政區的實價成交均價、法拍底價、預售行情，快速掌握區域房市差異。',
};

const SIX_METROS   = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
const OTHER_CITIES = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

export default async function CompareLandingPage() {
  // 每個縣市取成交量 top 8 行政區
  let districtMap: Record<string, { district: string; n: number; avgUnit: number | null }[]> = {};

  try {
    const rows = await prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT city, district,
              COUNT(*) as n,
              AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit
       FROM lvr_land
       WHERE city IS NOT NULL AND district IS NOT NULL
         AND tx_type LIKE '%建物%' AND total_price > 0
         AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
       GROUP BY city, district
       ORDER BY city, n DESC`
    );
    for (const r of rows) {
      if (!districtMap[r.city]) districtMap[r.city] = [];
      if (districtMap[r.city].length < 8) {
        districtMap[r.city].push({
          district: r.district,
          n: Number(r.n),
          avgUnit: r.avg_unit ? Number(r.avg_unit) * 3.30579 / 10000 : null,
        });
      }
    }
  } catch { /* DB 未就緒 */ }

  const allCities = [...SIX_METROS, ...OTHER_CITIES];

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
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; white-space: nowrap; }
        .wrap { max-width: 1100px; margin: 0 auto; padding: clamp(1.5rem,4vw,2.5rem) clamp(1rem,3vw,2rem) 4rem; }
        .city-section { margin-bottom: 2.25rem; }
        .city-label { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .45rem 1rem; background: #f0f5ff; margin-bottom: .6rem; }
        .dist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 5px; }
        .dist-btn { display: block; background: #fff; border: 1px solid #e0e8f8; padding: .6rem .9rem; text-decoration: none; transition: all .15s; }
        .dist-btn:hover { border-color: #2a5298; background: #f0f5ff; }
        .dist-name { font-size: .82rem; color: #333; font-weight: 500; margin-bottom: .18rem; }
        .dist-meta { font-size: .68rem; color: #aaa; font-weight: 300; }
        .dist-price { font-size: .75rem; color: #2a5298; font-weight: 600; }
        .no-data { color: #ccc; font-size: .75rem; padding: .6rem 1rem; background: #fff; border: 1px solid #ececec; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/price"   className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: '#fff', borderBottom: '4px solid #2a5298', padding: 'clamp(2rem,5vw,3rem) clamp(1rem,3vw,2rem)', textAlign: 'center' }}>
        <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.75rem' }}>COMPARE · 行情比較</p>
        <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.4rem,4vw,2rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.75rem', lineHeight: 1.55 }}>
          行政區行情比較
        </h1>
        <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 1.9, maxWidth: 520, margin: '0 auto' }}>
          選擇任一行政區，即可看到它與同縣市其他行政區的<br />
          實價均坪、法拍均底、預售均坪、成交量的橫向比較。
        </p>
      </div>

      <div className="wrap">
        {allCities.map(city => {
          const districts = districtMap[city] || [];
          return (
            <div key={city} className="city-section">
              <div className="city-label">{city}</div>
              {districts.length > 0 ? (
                <div className="dist-grid">
                  {districts.map(({ district, n, avgUnit }) => (
                    <a key={district}
                      href={`/compare/${encodeURIComponent(city)}/${encodeURIComponent(district)}`}
                      className="dist-btn">
                      <div className="dist-name">{district}</div>
                      <div className="dist-meta">
                        近兩年 {n.toLocaleString()} 筆
                        {avgUnit !== null && (
                          <span className="dist-price"> · {avgUnit.toFixed(1)} 萬/坪</span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="no-data">暫無資料</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
