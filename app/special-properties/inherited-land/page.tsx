import { Metadata } from 'next';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export const metadata: Metadata = {
  title: '逾期未辦繼承登記土地公告查詢',
  description: '全台各縣市地政事務所逾期未辦繼承登記土地最新公告，含公告期間、受理期限與官方連結。公告期滿後可申請法院代為標售，是法拍前期重要案源。',
  alternates: { canonical: '/special-properties/inherited-land' },
};

export default async function InheritedLandPage() {
  let rows: any[] = [];
  try {
    rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT city, district, land_office,
             announcement_start, announcement_end, application_end,
             source_url, scraped_date
      FROM inherited_land
      WHERE city IS NOT NULL AND district IS NOT NULL
      ORDER BY city, announcement_start DESC NULLS LAST
    `);
  } catch { /* ignore */ }

  // 依城市分組
  const byCity: Record<string, any[]> = {};
  for (const r of rows) {
    if (!byCity[r.city]) byCity[r.city] = [];
    byCity[r.city].push(r);
  }

  const today = new Date().toISOString().slice(0, 10);

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
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #c2632a; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .city-sec { margin-bottom: 2.5rem; }
        .city-head { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #c2632a; border-left: 4px solid #c2632a; padding: .5rem 1rem; background: #fff8f4; margin-bottom: .75rem; }
        .ann-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #f0e0d0; font-size: .82rem; }
        .ann-table th { background: #fff3ee; color: #c2632a; font-weight: 600; padding: .5rem .85rem; text-align: left; border-bottom: 2px solid #f0c4a0; font-size: .72rem; letter-spacing: .04em; white-space: nowrap; }
        .ann-table td { padding: .55rem .85rem; border-bottom: 1px solid #fff0e8; vertical-align: middle; }
        .ann-table tr:last-child td { border-bottom: none; }
        .ann-table tr:hover td { background: #fff8f4; }
        .dist-link { font-weight: 600; color: #c2632a; text-decoration: none; }
        .dist-link:hover { text-decoration: underline; }
        .date-cell { white-space: nowrap; font-size: .78rem; }
        .active-badge { display: inline-block; font-size: .62rem; background: #f4fbf0; color: #3a7d2c; border: 1px solid #b5dba5; padding: .1rem .4rem; border-radius: 2px; margin-left: .4rem; }
        .expired-badge { display: inline-block; font-size: .62rem; background: #f5f5f3; color: #aaa; border: 1px solid #e8e8e4; padding: .1rem .4rem; border-radius: 2px; margin-left: .4rem; }
        .src-link { font-size: .72rem; color: #2a5298; text-decoration: none; }
        .src-link:hover { text-decoration: underline; }
        .info-box { background: #fff8f4; border: 1px solid #f0c4a0; border-left: 4px solid #c2632a; padding: 1.25rem 1.5rem; margin-bottom: 2rem; font-size: .85rem; color: #555; line-height: 2; }
        .cta-box { background: #1a2a4a; color: #fff; padding: 1.5rem 2rem; margin-top: 2.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .cta-text { font-family: 'Noto Serif TC', serif; font-size: 1rem; }
        .cta-btn { display: inline-block; background: #c2632a; color: #fff; font-size: .82rem; font-weight: 500; padding: .65rem 1.5rem; text-decoration: none; border-radius: 2px; white-space: nowrap; }
        .cta-btn:hover { background: #e07340; }
        .empty-note { font-size: .82rem; color: #bbb; padding: 2rem; text-align: center; background: #fff; border: 1px dashed #e0e0e0; }
        @media(max-width:640px){ .ann-table { font-size: .72rem; } .ann-table th, .ann-table td { padding: .4rem .6rem; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',   item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '特殊物件', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/special-properties` },
          { '@type': 'ListItem', position: 3, name: '逾期未辦繼承登記土地' },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/special-properties" className="nav-link" style={{ color: '#c2632a' }}>特殊物件</a>
          <a href="/auction"            className="nav-link">法拍屋</a>
          <a href="/price"              className="nav-link">實價登錄</a>
          <a href="/presale"            className="nav-link">預售屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #c2632a', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/special-properties" className="crumb">特殊物件</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#c2632a', fontWeight: 500 }}>逾期未辦繼承登記土地</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.4rem' }}>INHERITED LAND · 逾期未辦繼承登記</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            逾期未辦繼承登記土地公告查詢
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            各縣市地政事務所最新公告，共 {rows.length} 筆，資料持續更新。
          </p>
        </div>
      </div>

      <div className="wrap">
        <div className="info-box">
          <strong style={{ color: '#c2632a' }}>什麼是逾期未辦繼承登記土地？</strong><br />
          依《地籍清理條例》，繼承人超過一定年限未辦繼承登記，地政事務所會公告該土地並受理申請。公告期滿後如仍未辦理，
          可申請由法院代為標售，是法拍前期最重要的案源信號之一。<br />
          <strong>受理期間到期前</strong>申請者可主張繼承或購買權利，需會同代書辦理相關手續。
        </div>

        {Object.keys(byCity).length === 0 ? (
          <div className="empty-note">目前暫無公告資料，請稍後再查</div>
        ) : (
          Object.entries(byCity).map(([city, cityRows]) => (
            <div key={city} className="city-sec">
              <div className="city-head">{city} — {cityRows.length} 筆公告</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="ann-table">
                  <thead>
                    <tr>
                      <th>行政區</th>
                      <th>地政事務所</th>
                      <th>公告期間</th>
                      <th>受理申請截止</th>
                      <th>官方資料</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityRows.map((r: any, i: number) => {
                      const isActive = !r.announcement_end || r.announcement_end >= today;
                      return (
                        <tr key={i}>
                          <td>
                            <a href={`/special-properties/inherited-land/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`}
                              className="dist-link">
                              {r.district}
                            </a>
                            {isActive
                              ? <span className="active-badge">公告中</span>
                              : <span className="expired-badge">已結束</span>}
                          </td>
                          <td style={{ color: '#666' }}>{r.land_office || '—'}</td>
                          <td className="date-cell">
                            {r.announcement_start || '—'}
                            {r.announcement_end && ` ～ ${r.announcement_end}`}
                          </td>
                          <td className="date-cell" style={{ color: r.application_end && r.application_end < today ? '#aaa' : '#c2632a', fontWeight: 500 }}>
                            {r.application_end || '—'}
                          </td>
                          <td>
                            {r.source_url
                              ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="src-link">官方公告 ↗</a>
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        <div className="cta-box">
          <div className="cta-text">看到感興趣的繼承土地公告？<br />需要代書協助確認權利或辦理申請</div>
          <a href="/auction" className="cta-btn">聯絡我們諮詢 →</a>
        </div>

        <div style={{ marginTop: '2rem', background: '#f5f5f3', border: '1px solid #e8e8e4', padding: '1rem 1.25rem', fontSize: '.75rem', color: '#aaa', lineHeight: 1.9 }}>
          資料來源：各縣市地政事務所官方公告頁面，每日自動更新。公告內容僅供參考，實際辦理請以各地政事務所現行公告為準。
        </div>
      </div>
    </>
  );
}
