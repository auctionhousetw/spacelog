import { Metadata } from 'next';
import prisma from '@/lib/prisma';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: '區段徵收開發案查詢 | 台中・新北・桃園',
  description: '台灣各縣市政府辦理區段徵收開發案資訊，包含開發中與已完成案件。被徵收土地所有人可查詢補償費、抵價地分配，並了解申請程序與代書服務。',
  alternates: { canonical: '/special-properties/rezoning' },
};

type RezoningCase = {
  city: string | null;
  case_name: string | null;
  status: string | null;
  content_summary: string | null;
  source_url: string | null;
};

export default async function RezoningPage() {
  let cases: RezoningCase[] = [];

  try {
    cases = await prisma.$queryRawUnsafe<RezoningCase[]>(`
      SELECT city, case_name, status, content_summary, source_url
      FROM rezoning_case
      WHERE city IS NOT NULL AND case_name IS NOT NULL
        AND (case_name LIKE '%區段徵收%' OR case_name LIKE '%開發案%' OR case_name LIKE '%徵收區%')
        AND length(case_name) >= 8
      ORDER BY city,
               CASE WHEN status = '開發中' THEN 0 ELSE 1 END,
               case_name
    `);
  } catch { /* DB 未就緒 */ }

  const byCity: Record<string, RezoningCase[]> = {};
  for (const c of cases) {
    const city = c.city ?? '其他';
    if (!byCity[city]) byCity[city] = [];
    byCity[city].push(c);
  }

  const activeCount = cases.filter(c => c.status === '開發中').length;

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
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .stat-bar { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .stat-item { background: #fff; border: 1px solid #e0d0c0; padding: .6rem 1.1rem; border-radius: 2px; }
        .stat-num { font-family: 'Noto Serif TC', serif; font-size: 1.5rem; font-weight: 700; color: #b85c00; line-height: 1.2; }
        .stat-label { font-size: .68rem; color: #888; margin-top: .15rem; }
        .city-sec { margin-bottom: 2.25rem; }
        .city-head { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 700; color: #b85c00; border-left: 4px solid #b85c00; padding: .5rem 1rem; background: #fff8f0; margin-bottom: .75rem; display: flex; justify-content: space-between; align-items: center; }
        .city-count { font-family: 'Noto Sans TC', sans-serif; font-size: .72rem; font-weight: 400; color: #aaa; }
        .case-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap: .75rem; }
        .case-card { background: #fff; border: 1px solid #e8e0d8; text-decoration: none; display: block; padding: 1rem 1.25rem; transition: all .15s; position: relative; }
        .case-card:hover { border-color: #b85c00; box-shadow: 0 2px 8px rgba(184,92,0,.1); transform: translateY(-1px); }
        .case-name { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #1a2a4a; line-height: 1.6; margin-bottom: .4rem; }
        .case-summary { font-size: .72rem; color: #777; line-height: 1.75; }
        .status-badge { display: inline-block; font-size: .6rem; padding: .1rem .45rem; border-radius: 2px; font-weight: 600; margin-bottom: .4rem; }
        .status-active { background: #fff3e0; color: #b85c00; border: 1px solid #f0c080; }
        .status-done { background: #f5f5f3; color: #999; border: 1px solid #e0e0dc; }
        .status-unknown { display: none; }
        .src-arrow { position: absolute; bottom: .75rem; right: .85rem; font-size: .68rem; color: #b85c00; }
        .explain-box { background: #fff8f0; border: 1px solid #f0c080; border-left: 4px solid #b85c00; padding: 1rem 1.25rem; font-size: .78rem; color: #7a4000; line-height: 1.9; margin-bottom: 1.75rem; }
        .cta-box { background: #1a2a4a; color: #fff; padding: 1.5rem 2rem; margin-top: 2.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
        .cta-text { font-family: 'Noto Serif TC', serif; font-size: 1rem; }
        .cta-btn { display: inline-block; background: #c2632a; color: #fff; font-size: .82rem; font-weight: 500; padding: .65rem 1.5rem; text-decoration: none; border-radius: 2px; }
        .cta-btn:hover { background: #e07340; }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '特殊物件', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/special-properties` },
          { '@type': 'ListItem', position: 3, name: '區段徵收' },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction"            className="nav-link">法拍屋</a>
          <a href="/price"              className="nav-link">實價登錄</a>
          <a href="/special-properties" className="nav-link" style={{ color: '#b85c00', fontWeight: 500 }}>特殊物件</a>
          <a href="/land-readjustment"  className="nav-link">重劃區</a>
          <a href="/compare"            className="nav-link">行情比較</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #b85c00', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/special-properties" className="crumb">特殊物件</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#b85c00', fontWeight: 500 }}>區段徵收</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.2em', color: '#b85c00', marginBottom: '.4rem' }}>LAND EXPROPRIATION · 區段徵收</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            區段徵收開發案查詢
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            各縣市政府辦理區段徵收開發案資訊，含開發中與已完成案件。共 {cases.length} 筆，資料持續更新。
          </p>
        </div>
      </div>

      <div className="wrap">
        <div className="stat-bar">
          <div className="stat-item">
            <div className="stat-num">{cases.length}</div>
            <div className="stat-label">總案件數</div>
          </div>
          {activeCount > 0 && (
            <div className="stat-item">
              <div className="stat-num" style={{ color: '#b85c00' }}>{activeCount}</div>
              <div className="stat-label">開發中</div>
            </div>
          )}
          <div className="stat-item">
            <div className="stat-num">{Object.keys(byCity).length}</div>
            <div className="stat-label">涵蓋縣市</div>
          </div>
        </div>

        <div className="explain-box">
          <strong style={{ color: '#b85c00' }}>什麼是區段徵收？</strong><br />
          政府為開發特定地區，強制取得土地後統一規劃開發，土地所有人可選擇領取<strong>現金補償</strong>或取得開發後的<strong>抵價地</strong>。
          被徵收者若不了解自身權益，往往僅領現金而失去土地增值空間。<br />
          <strong>重要節點</strong>：公告區段徵收計畫 → 申請抵價地（截止前須決定）→ 配地結果公告 → 完成開發後土地升值。
        </div>

        {cases.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: '.85rem', textAlign: 'center', marginTop: '3rem' }}>
            目前無案件資料，請稍後再查。
          </p>
        ) : (
          Object.entries(byCity).map(([city, rows]) => (
            <div key={city} className="city-sec">
              <div className="city-head">
                {city}
                <span className="city-count">{rows.length} 件</span>
              </div>
              <div className="case-grid">
                {rows.map((c, i) => (
                  <a key={i}
                    href={c.source_url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="case-card"
                  >
                    {c.status && (
                      <div className={`status-badge ${c.status === '開發中' ? 'status-active' : c.status === '已完成' ? 'status-done' : 'status-unknown'}`}>
                        {c.status}
                      </div>
                    )}
                    <div className="case-name">{c.case_name}</div>
                    {c.content_summary && (
                      <div className="case-summary">
                        {c.content_summary.slice(0, 120)}…
                      </div>
                    )}
                    <span className="src-arrow">官方資料 ↗</span>
                  </a>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="cta-box">
          <div className="cta-text">被徵收的土地要選現金還是抵價地？<br />需要代書協助評估補償方案</div>
          <a href="/auction" className="cta-btn">聯絡我們諮詢 →</a>
        </div>

        <div style={{ marginTop: '2rem', background: '#f5f5f3', border: '1px solid #e8e8e4', padding: '1rem 1.25rem', fontSize: '.75rem', color: '#aaa', lineHeight: 1.9 }}>
          資料來源：台中市地政局（land.taichung.gov.tw）、新北市地政局（land.ntpc.gov.tw）。每日定期更新，實際案件進度以各縣市政府現行公告為準。
        </div>
      </div>
    </>
  );
}
