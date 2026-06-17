import { Metadata } from 'next';
import prisma from '@/lib/prisma';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: '建設公司社區查詢 | 全台建商建案列表',
  description: '依建設公司查詢全台社區大樓建案。收錄各大建商興建的住宅社區，含屋齡、戶數、社區名稱，並整合實價登錄成交記錄。',
  alternates: { canonical: '/builder' },
};

type BuilderRow = { builder: string; cnt: number };

export default async function BuilderIndexPage() {
  let builders: BuilderRow[] = [];
  try {
    builders = await prisma.$queryRawUnsafe<BuilderRow[]>(`
      SELECT builder, COUNT(*) AS cnt
      FROM community_names
      WHERE builder IS NOT NULL AND builder != ''
      GROUP BY builder
      ORDER BY cnt DESC, builder
      LIMIT 500
    `);
  } catch { /* ignore */ }

  const total = builders.reduce((s, r) => s + Number(r.cnt), 0);

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
        .builder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .75rem; margin-top: 1.5rem; }
        .builder-card { background: #fff; border: 1px solid #ebe8e4; padding: .85rem 1rem; text-decoration: none; color: #333; display: flex; justify-content: space-between; align-items: center; transition: border-color .15s; }
        .builder-card:hover { border-color: #c2632a; color: #c2632a; }
        .builder-name { font-size: .85rem; font-weight: 500; }
        .builder-cnt { font-size: .72rem; color: #bbb; white-space: nowrap; }
        .builder-card:hover .builder-cnt { color: #c2632a; }
        .empty-note { text-align: center; color: #bbb; font-size: .85rem; padding: 3rem; background: #fff; border: 1px dashed #e0e0e0; }
        .info-box { background: #fff8f4; border: 1px solid #f0c4a0; border-left: 4px solid #c2632a; padding: 1rem 1.25rem; margin-bottom: 1.5rem; font-size: .82rem; color: #666; line-height: 1.9; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/community" className="nav-link">社區大樓</a>
          <a href="/auction"   className="nav-link">法拍屋</a>
          <a href="/price"     className="nav-link">實價登錄</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #c2632a', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem' }}>
            <a href="/" className="crumb">首頁</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#c2632a', fontWeight: 500 }}>建設公司</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.4rem' }}>BUILDER · 建設公司</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            建設公司社區查詢
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            共收錄 {builders.length} 家建設公司、{total.toLocaleString()} 個社區大樓建案
          </p>
        </div>
      </div>

      <div className="wrap">
        <div className="info-box">
          點擊建設公司名稱，可查看該建商在全台興建的社區大樓列表，包含地址、屋齡、戶數，以及整合的實價登錄成交資料。
        </div>

        {builders.length === 0 ? (
          <div className="empty-note">資料建立中，請稍後再來</div>
        ) : (
          <div className="builder-grid">
            {builders.map((r) => (
              <a
                key={r.builder}
                href={`/builder/${encodeURIComponent(r.builder)}`}
                className="builder-card"
              >
                <span className="builder-name">{r.builder}</span>
                <span className="builder-cnt">{Number(r.cnt)} 個社區</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
