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
    title: `${c}社區大樓查詢 | 各行政區社區名稱・實價登錄`,
    description: `${c}各行政區社區大樓、華廈、公寓名稱查詢。收錄政府管委會、實價登錄等來源，點選社區名稱可查歷年成交記錄與法拍資訊。`,
    alternates: { canonical: `/community/${city}` },
  };
}

export default async function CommunityCityPage({ params }: { params: Params }) {
  const { city } = await params;
  const c = decodeURIComponent(city);
  const safeC = c.replace(/'/g, "''");

  let distRows: any[] = [], totalCount = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT district,
             COUNT(*) as community_count,
             SUM(COALESCE(tx_count,0)) as tx_total
      FROM community_names
      WHERE city='${safeC}'
        AND district != ''
        AND LENGTH(district) BETWEEN 2 AND 4
        AND district ~ '[區鎮鄉市]$'
        AND (LENGTH(district) < 4 OR district !~ '[區鎮鄉市][區鎮鄉市]$')
      GROUP BY district
      ORDER BY community_count DESC
    `);
    if (!rows.length) notFound();
    distRows   = rows;
    totalCount = rows.reduce((s, r) => s + Number(r.community_count), 0);
  } catch { notFound(); }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', 'PingFang TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; }
        .nav-link:hover { color: #c2632a; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .dist-card { background: #fff; border: 1px solid #ececec; padding: 1rem 1.25rem; text-decoration: none; color: inherit; display: flex; justify-content: space-between; align-items: center; }
        .dist-card:hover { background: #f8f9ff; border-color: #b8d0f0; }
        .dist-name { font-size: 1rem; font-weight: 600; color: #1e3a6e; }
        .dist-count { font-size: .8rem; color: #888; }
        .badge { font-size: .68rem; background: #f0f5ff; color: #2a5298; border: 1px solid #d0e4ff; border-radius: 2px; padding: 1px 6px; }
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

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11, flexWrap: 'wrap' }}>
          <a href="/" className="crumb">首頁</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href="/community" className="crumb">社區大樓</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#444', fontWeight: 500 }}>{c}</span>
        </nav>

        <div style={{ background: '#fff', borderTop: '4px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.5rem' }}>
            COMMUNITY SEARCH · 社區大樓
          </p>
          <h1 style={{ fontSize: 'clamp(1.3rem,4vw,1.75rem)', fontWeight: 700, color: '#1e3a6e', marginBottom: '.6rem', lineHeight: 1.4 }}>
            {c}社區大樓查詢
          </h1>
          <p style={{ fontSize: '.88rem', color: '#888', lineHeight: 2, margin: 0 }}>
            收錄 {c} <strong style={{ color: '#2a5298' }}>{totalCount.toLocaleString()} 個</strong>社區大樓名稱，
            橫跨 <strong style={{ color: '#2a5298' }}>{distRows.length}</strong> 個行政區。
            點選行政區查詢社區名稱與歷年實價成交。
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1, background: '#ececec', marginTop: 1 }}>
          {distRows.map((r: any) => (
            <a
              key={r.district}
              href={`/community/${encodeURIComponent(c)}/${encodeURIComponent(r.district)}`}
              className="dist-card"
            >
              <div>
                <div className="dist-name">{r.district}</div>
                <div className="dist-count" style={{ marginTop: '.25rem' }}>
                  {Number(r.community_count).toLocaleString()} 個社區
                  {Number(r.tx_total) > 0 && <span style={{ marginLeft: 6 }}>· {Number(r.tx_total).toLocaleString()} 筆成交</span>}
                </div>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: '#f9f9f8', border: '1px solid #ececec', fontSize: '.8rem', color: '#888', lineHeight: 1.9 }}>
          資料來源：政府管委會公開資料、實價登錄成交記錄、好房網、591 等平台。
          點選行政區後可依社區名稱搜尋，並查看該社區歷年成交、法拍狀況與預售建案。
        </div>

      </main>
    </>
  );
}
