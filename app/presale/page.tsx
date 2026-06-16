import { PrismaClient } from '@prisma/client';
import { notFound } from 'next/navigation';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export const metadata = {
  title: '預售屋成交行情 | 全台各縣市建案實價登錄',
  description: '全台預售屋實價登錄成交資料，依縣市、行政區、建案查詢預售屋成交均價、坪數與格局分布，掌握新建案市場行情。',
};

const SIX_METROS   = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
const OTHER_CITIES = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

export default async function PresalePage() {
  let cityStats: { city: string; n: number; avg: number | null; projects: number }[] = [];
  let total = 0;

  try {
    const rows = await prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT city,
              COUNT(*) as n,
              AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
              COUNT(DISTINCT project_name) as projects
       FROM lvr_presale
       WHERE city IS NOT NULL AND city != ''
       GROUP BY city ORDER BY n DESC`
    ).catch(() => []);
    cityStats = rows.map((r: any) => ({
      city:     r.city,
      n:        Number(r.n),
      avg:      r.avg ? Math.round(Number(r.avg) / 10000) : null,
      projects: Number(r.projects),
    }));
    total = cityStats.reduce((s, r) => s + r.n, 0);
  } catch { /* DB 未就緒 */ }

  const cityMap = Object.fromEntries(cityStats.map(s => [s.city, s]));

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
        .nav-link:hover { color: #1a6b3a; background: #f0fdf4; }
        .hero { background: #fff; border-bottom: 1px solid #ececec; padding: clamp(2rem,5vw,3.5rem) clamp(1rem,3vw,2rem); text-align: center; }
        .hero-eye  { font-size: .72rem; letter-spacing: .22em; color: #1a6b3a; margin-bottom: .75rem; font-weight: 500; }
        .hero-h1   { font-family: 'Noto Serif TC', serif; font-size: clamp(1.5rem,4vw,2.2rem); font-weight: 700; color: #222; margin-bottom: .75rem; }
        .hero-sub  { font-size: .88rem; color: #888; font-weight: 300; max-width: 520px; margin: 0 auto; line-height: 1.9; }
        .stat-strip { background: #fff; border-bottom: 1px solid #ececec; display: flex; justify-content: center; gap: 0; }
        .stat-cell  { padding: 1rem 2.5rem; text-align: center; border-right: 1px solid #f0f0f0; }
        .stat-cell:last-child { border-right: none; }
        .stat-val   { font-family: 'Noto Serif TC', serif; font-size: 1.3rem; font-weight: 700; color: #1a6b3a; }
        .stat-lbl   { font-size: .72rem; color: #aaa; margin-top: .2rem; }
        .wrap { max-width: 1000px; margin: 0 auto; padding: clamp(1.5rem,4vw,2.5rem) clamp(1rem,3vw,2rem); }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #1a6b3a; border-left: 4px solid #1a6b3a; padding: .55rem 1rem; background: #f0fdf4; margin-bottom: 1rem; }
        .city-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 2rem; }
        .city-card { display: block; background: #fff; border: 1px solid #d1e8d8; padding: 1rem 1.1rem; text-decoration: none; color: inherit; transition: all .15s; border-radius: 2px; }
        .city-card:hover { border-color: #1a6b3a; box-shadow: 0 2px 8px rgba(26,107,58,.1); }
        .city-name { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #1a6b3a; margin-bottom: .35rem; }
        .city-n    { font-size: .72rem; color: #2a8a4a; }
        .city-avg  { font-size: .78rem; color: #c2632a; font-weight: 500; margin-top: .2rem; }
        .city-proj { font-size: .68rem; color: #bbb; margin-top: .1rem; }
        .footer { background: #fff; border-top: 1px solid #ececec; padding: 2rem; text-align: center; margin-top: 3rem; }
        .footer p { font-size: .78rem; color: #bbb; line-height: 1.9; margin: 0; }
        @media (max-width: 600px) { .stat-cell { padding: .85rem 1.25rem; } }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price"   className="nav-link">實價登錄</a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <div className="hero">
        <p className="hero-eye">PRESALE · 預售屋成交行情</p>
        <h1 className="hero-h1">全台預售屋實價登錄</h1>
        <p className="hero-sub">
          依縣市、行政區、建案查詢預售屋成交均價與格局分布，<br />
          資料來源：內政部不動產交易實價登錄（b 檔）。
        </p>
      </div>

      {total > 0 && (
        <div className="stat-strip">
          <div className="stat-cell">
            <div className="stat-val">{total.toLocaleString()}</div>
            <div className="stat-lbl">預售成交總筆數</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val">{cityStats.length}</div>
            <div className="stat-lbl">縣市</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val">{cityStats.reduce((s, r) => s + r.projects, 0).toLocaleString()}</div>
            <div className="stat-lbl">建案數</div>
          </div>
        </div>
      )}

      <div className="wrap">
        <div className="sec-head">六都</div>
        <div className="city-grid">
          {SIX_METROS.map(city => {
            const s = cityMap[city];
            return (
              <a key={city} href={`/presale/${encodeURIComponent(city)}`} className="city-card">
                <div className="city-name">{city}</div>
                {s ? (
                  <>
                    <div className="city-n">{s.n.toLocaleString()} 筆成交</div>
                    {s.avg && <div className="city-avg">均價 {s.avg.toLocaleString()} 萬</div>}
                    <div className="city-proj">{s.projects} 個建案</div>
                  </>
                ) : <div className="city-n" style={{ color: '#ccc' }}>暫無資料</div>}
              </a>
            );
          })}
        </div>

        <div className="sec-head">其他縣市</div>
        <div className="city-grid">
          {OTHER_CITIES.map(city => {
            const s = cityMap[city];
            return (
              <a key={city} href={`/presale/${encodeURIComponent(city)}`} className="city-card">
                <div className="city-name">{city}</div>
                {s ? (
                  <>
                    <div className="city-n">{s.n.toLocaleString()} 筆成交</div>
                    {s.avg && <div className="city-avg">均價 {s.avg.toLocaleString()} 萬</div>}
                    <div className="city-proj">{s.projects} 個建案</div>
                  </>
                ) : <div className="city-n" style={{ color: '#ccc' }}>暫無資料</div>}
              </a>
            );
          })}
        </div>
      </div>

      <footer className="footer">
        <p>預售屋成交資料來源：內政部不動產交易實價登錄，僅供參考。<br />投資購屋前請向建商確認最新售價與合約條件。</p>
      </footer>
    </>
  );
}
