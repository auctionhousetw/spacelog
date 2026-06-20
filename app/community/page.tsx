export const revalidate = 86400;
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export const metadata = {
  title: '社區大樓查詢 | 全台實價登錄・管委會資料整合',
  description: '收錄全台 22 縣市、88,000 個社區大樓名稱。整合政府管委會公開資料、實價登錄與各大房仲平台，查詢社區名稱可看歷年成交記錄與法拍資訊。',
  alternates: { canonical: '/community' },
};

const CITY_ORDER = [
  '台北市','新北市','基隆市','桃園市','新竹市','新竹縣','苗栗縣',
  '台中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣',
  '台南市','高雄市','屏東縣','宜蘭縣','花蓮縣','台東縣',
  '澎湖縣','金門縣','連江縣',
];

export default async function CommunityIndexPage() {
  let cityRows: any[] = [];
  let grandTotal = 0;
  try {
    cityRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT city,
             COUNT(*) as community_count,
             COUNT(DISTINCT district) as district_count
      FROM community_names
      GROUP BY city
      ORDER BY community_count DESC
    `);
    grandTotal = cityRows.reduce((s, r) => s + Number(r.community_count), 0);
  } catch { /* DB unavailable */ }

  const cityMap = new Map(cityRows.map(r => [r.city, r]));
  const cities  = CITY_ORDER
    .filter(c => cityMap.has(c))
    .map(c => ({ city: c, ...cityMap.get(c) }));

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', 'PingFang TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .city-card { background: #fff; border: 1px solid #ececec; padding: 1.1rem 1.25rem; text-decoration: none; color: inherit; display: block; transition: border-color .15s, background .15s; }
        .city-card:hover { background: #f5f8ff; border-color: #b8d0f0; }
        .city-name { font-size: 1.05rem; font-weight: 700; color: #1e3a6e; }
        .city-stats { font-size: .75rem; color: #888; margin-top: .35rem; }
        .search-box { width: 100%; padding: .8rem 1.1rem; border: 1px solid #ddd; border-radius: 4px; font-size: .95rem; outline: none; }
        .search-box:focus { border-color: #2a5298; box-shadow: 0 0 0 3px rgba(42,82,152,.1); }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋資訊平台</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link">實價登錄</a>
          <a href="/community" className="nav-link" style={{ color: '#2a5298' }}>社區大樓</a>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem) 5rem' }}>

        <div style={{ padding: '2.5rem 0 1.5rem' }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.5rem' }}>
            COMMUNITY SEARCH · 社區大樓
          </p>
          <h1 style={{ fontSize: 'clamp(1.5rem,5vw,2.2rem)', fontWeight: 700, color: '#1e3a6e', marginBottom: '.75rem', lineHeight: 1.3 }}>
            全台社區大樓查詢
          </h1>
          <p style={{ fontSize: '.9rem', color: '#666', lineHeight: 1.9, maxWidth: 560, margin: 0 }}>
            收錄全台 <strong style={{ color: '#2a5298' }}>{grandTotal.toLocaleString()}</strong> 個社區大樓。
            整合政府管委會、實價登錄、好房網、591 等來源，
            點選縣市可查詢各行政區社區名稱與歷年成交記錄。
          </p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <a
            href="/community/search"
            style={{
              display: 'inline-block', background: '#2a5298', color: '#fff',
              padding: '.7rem 1.6rem', borderRadius: 3, fontSize: '.88rem',
              textDecoration: 'none', fontWeight: 500, letterSpacing: '.03em',
            }}
          >
            社區名稱搜尋 →
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {cities.map((r: any) => (
            <a
              key={r.city}
              href={`/community/${encodeURIComponent(r.city)}`}
              className="city-card"
            >
              <div className="city-name">{r.city}</div>
              <div className="city-stats">
                {Number(r.community_count).toLocaleString()} 個社區 · {Number(r.district_count)} 個行政區
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: '3rem', padding: '1.25rem', background: '#f9f9f8', border: '1px solid #ececec', fontSize: '.8rem', color: '#888', lineHeight: 2 }}>
          <strong style={{ color: '#555' }}>資料來源說明</strong><br />
          管委會資料來自政府開放資料平台，為最可信的社區名稱依據。
          實價登錄資料取自內政部不動產成交案件實際資訊，反映真實交易。
          好房網、591 資料提供更完整的社區覆蓋，但部分社區名稱可能為行銷用途。
        </div>

      </main>
    </>
  );
}
