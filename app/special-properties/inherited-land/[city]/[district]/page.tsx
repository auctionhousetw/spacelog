import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

export const revalidate = 86400;

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { city: cityEnc, district: distEnc } = await params;
  const city = decodeURIComponent(cityEnc);
  const dist = decodeURIComponent(distEnc);
  return {
    title: `${city}${dist} 逾期未辦繼承登記土地公告`,
    description: `${city}${dist}地政事務所公告之逾期未辦繼承登記土地，公告期間、受理截止、官方連結。公告期滿後可申請法院代為標售。`,
    alternates: { canonical: `/special-properties/inherited-land/${cityEnc}/${distEnc}` },
  };
}

export default async function DistrictInheritedLandPage({ params }: { params: Params }) {
  const { city: cityEnc, district: distEnc } = await params;
  const city = decodeURIComponent(cityEnc);
  const dist = decodeURIComponent(distEnc);

  const safeCity = city.replace(/'/g, "''");
  const safeDist = dist.replace(/'/g, "''");

  let records: any[] = [];
  let auctionCount = 0;
  try {
    [records] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT city, district, land_office,
               announcement_start, announcement_end, application_end,
               source_url, scraped_date
        FROM inherited_land
        WHERE city='${safeCity}' AND district='${safeDist}'
        ORDER BY announcement_start DESC NULLS LAST
      `),
    ]);
    const aRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) as n FROM houses WHERE city='${safeCity}' AND district='${safeDist}'
    `).catch(() => []);
    auctionCount = Number(aRows[0]?.n ?? 0);
  } catch { /* ignore */ }

  if (records.length === 0) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const latest = records[0];
  const isActive = !latest.announcement_end || latest.announcement_end >= today;

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
        .kpi3 { display: grid; grid-template-columns: repeat(3,1fr); background: #fff; border-bottom: 1px solid #ececec; }
        .kpi-cell { padding: 1rem 1.25rem; border-right: 1px solid #f0f0f0; }
        .kpi-cell:last-child { border-right: none; }
        .kpi-val { font-family: 'Noto Serif TC', serif; font-size: 1.1rem; font-weight: 700; color: #c2632a; }
        .kpi-lbl { font-size: .68rem; color: #aaa; margin-top: .15rem; }
        .ann-card { background: #fff; border: 1px solid #f0c4a0; border-left: 4px solid #c2632a; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
        .ann-status { display: inline-block; font-size: .72rem; font-weight: 500; padding: .2rem .6rem; border-radius: 2px; margin-bottom: .75rem; }
        .ann-status.active { background: #f4fbf0; color: #3a7d2c; border: 1px solid #b5dba5; }
        .ann-status.expired { background: #f5f5f3; color: #aaa; border: 1px solid #e8e8e4; }
        .ann-row { display: flex; gap: .5rem; margin-bottom: .4rem; font-size: .82rem; }
        .ann-label { color: #aaa; min-width: 80px; flex-shrink: 0; }
        .ann-val { color: #333; font-weight: 500; }
        .cta-box { background: #1a2a4a; color: #fff; padding: 1.5rem 2rem; margin-top: 2rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .cta-text { font-family: 'Noto Serif TC', serif; font-size: 1rem; }
        .cta-btn { display: inline-block; background: #c2632a; color: #fff; font-size: .82rem; font-weight: 500; padding: .65rem 1.5rem; text-decoration: none; border-radius: 2px; }
        .cta-btn:hover { background: #e07340; }
        .shortcut-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .btn { display: inline-block; padding: .4rem .85rem; background: #fff; border: 1px solid #f0c4a0; color: #c2632a; font-size: .78rem; text-decoration: none; border-radius: 2px; }
        .btn:hover { background: #fff8f4; }
        .btn.blue { border-color: #b8d0f0; color: #2a5298; }
        .btn.blue:hover { background: #f0f5ff; }
        @media(max-width:640px){ .kpi3 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '特殊物件', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/special-properties` },
          { '@type': 'ListItem', position: 3, name: '逾期未辦繼承登記土地', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/special-properties/inherited-land` },
          { '@type': 'ListItem', position: 4, name: `${city}${dist}` },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/special-properties" className="nav-link" style={{ color: '#c2632a' }}>特殊物件</a>
          <a href="/auction"            className="nav-link">法拍屋</a>
          <a href="/price"              className="nav-link">實價登錄</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #c2632a', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/special-properties" className="crumb">特殊物件</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href="/special-properties/inherited-land" className="crumb">逾期未辦繼承</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#c2632a', fontWeight: 500 }}>{city}{dist}</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.4rem' }}>逾期未辦繼承登記土地</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            {city}{dist} 逾期未辦繼承登記土地公告
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            {latest.land_office || `${city}地政事務所`}公告，共 {records.length} 筆歷史記錄。
          </p>
        </div>
      </div>

      <div className="kpi3">
        <div className="kpi-cell">
          <div className="kpi-lbl">最新公告狀態</div>
          <div className="kpi-val" style={{ color: isActive ? '#3a7d2c' : '#aaa' }}>
            {isActive ? '公告中' : '已結束'}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-lbl">受理申請截止</div>
          <div className="kpi-val" style={{ fontSize: '.9rem' }}>
            {latest.application_end || '—'}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-lbl">本區法拍物件</div>
          <div className="kpi-val">{auctionCount > 0 ? auctionCount.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="wrap">
        <div className="shortcut-row">
          <a href={`/auction/${encodeURIComponent(city)}/${encodeURIComponent(dist)}`} className="btn">
            🏛️ {dist} 法拍屋
          </a>
          <a href={`/price/${encodeURIComponent(city)}/${encodeURIComponent(dist)}`} className="btn blue">
            📊 {dist} 實價登錄
          </a>
          <a href="/special-properties/inherited-land" className="btn" style={{ borderColor: '#ddd', color: '#888' }}>
            ← 查其他行政區
          </a>
        </div>

        {records.map((r: any, i: number) => {
          const active = !r.announcement_end || r.announcement_end >= today;
          return (
            <div key={i} className="ann-card">
              <div className={`ann-status ${active ? 'active' : 'expired'}`}>
                {active ? '● 公告進行中' : '● 公告已結束'}
              </div>
              {r.land_office && (
                <div className="ann-row">
                  <span className="ann-label">辦理機關</span>
                  <span className="ann-val">{r.land_office}</span>
                </div>
              )}
              <div className="ann-row">
                <span className="ann-label">公告期間</span>
                <span className="ann-val">
                  {r.announcement_start || '—'} ～ {r.announcement_end || '—'}
                </span>
              </div>
              <div className="ann-row">
                <span className="ann-label">受理截止</span>
                <span className="ann-val" style={{ color: active && r.application_end ? '#c2632a' : undefined }}>
                  {r.application_end || '—'}
                </span>
              </div>
              {r.source_url && (
                <div className="ann-row">
                  <span className="ann-label">官方公告</span>
                  <span>
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#2a5298', fontSize: '.78rem' }}>
                      前往官方查看清冊 ↗
                    </a>
                  </span>
                </div>
              )}
              {r.scraped_date && (
                <div style={{ marginTop: '.5rem', fontSize: '.68rem', color: '#ccc' }}>
                  資料更新：{r.scraped_date}
                </div>
              )}
            </div>
          );
        })}

        <div className="cta-box">
          <div className="cta-text">
            {isActive
              ? <>受理申請截止 {latest.application_end}，時間緊迫<br />需要代書確認可申請土地與辦理流程？</>
              : <>{city}{dist} 本期公告已結束<br />可留意下次公告或查詢本區法拍物件</>}
          </div>
          <a href={`/auction/${encodeURIComponent(city)}/${encodeURIComponent(dist)}`} className="cta-btn">
            {isActive ? '立即諮詢代書 →' : '查看本區法拍屋 →'}
          </a>
        </div>
      </div>
    </>
  );
}
