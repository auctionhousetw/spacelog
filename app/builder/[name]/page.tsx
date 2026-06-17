import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';

export const revalidate = 86400;

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const builderName = decodeURIComponent(name);
  return {
    title: `${builderName} 建案社區列表`,
    description: `${builderName} 興建的全台社區大樓列表，含地址、屋齡、戶數及實價登錄成交資料。`,
    alternates: { canonical: `/builder/${name}` },
  };
}

type Community = {
  city: string;
  district: string;
  name: string;
  addr: string;
  units: string | null;
  building_age: string | null;
  avg_area: string | null;
  tx_count: number | null;
};

export default async function BuilderDetailPage({ params }: Props) {
  const { name } = await params;
  const builderName = decodeURIComponent(name);
  const safe = builderName.replace(/'/g, "''");

  let communities: Community[] = [];
  try {
    communities = await prisma.$queryRawUnsafe<Community[]>(`
      SELECT city, district, name, addr, units, building_age, avg_area, tx_count
      FROM community_names
      WHERE builder = '${safe}'
        AND name IS NOT NULL AND name != ''
      ORDER BY city, district, COALESCE(tx_count, 0) DESC, name
      LIMIT 300
    `);
  } catch { /* ignore */ }

  if (communities.length === 0) notFound();

  // 依城市分組
  const byCity: Record<string, Community[]> = {};
  for (const c of communities) {
    if (!byCity[c.city]) byCity[c.city] = [];
    byCity[c.city].push(c);
  }

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
        .comm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .65rem; }
        .comm-card { background: #fff; border: 1px solid #ebe8e4; padding: .85rem 1rem; text-decoration: none; color: #333; display: block; transition: border-color .15s; }
        .comm-card:hover { border-color: #c2632a; }
        .comm-name { font-size: .88rem; font-weight: 600; color: #1a2a4a; margin-bottom: .3rem; }
        .comm-card:hover .comm-name { color: #c2632a; }
        .comm-addr { font-size: .72rem; color: #aaa; margin-bottom: .4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .comm-meta { display: flex; gap: .75rem; font-size: .7rem; color: #999; flex-wrap: wrap; }
        .tx-badge { background: #fff3ee; color: #c2632a; border: 1px solid #f0c4a0; padding: .1rem .4rem; border-radius: 2px; font-size: .65rem; }
        .stat-row { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .stat-item { background: #fff; border: 1px solid #e0d0c0; padding: .6rem 1.1rem; font-size: .8rem; color: #666; }
        .stat-item strong { display: block; font-size: 1.1rem; color: #1a2a4a; font-family: 'Noto Serif TC', serif; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/builder" className="nav-link" style={{ color: '#c2632a' }}>建設公司</a>
          <a href="/community" className="nav-link">社區大樓</a>
          <a href="/auction"   className="nav-link">法拍屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #c2632a', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/" className="crumb">首頁</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href="/builder" className="crumb">建設公司</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#c2632a', fontWeight: 500 }}>{builderName}</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.4rem' }}>BUILDER · 建設公司</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            {builderName} 建案列表
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            共 {communities.length} 個社區，分布於 {Object.keys(byCity).length} 個縣市
          </p>
        </div>
      </div>

      <div className="wrap">
        <div className="stat-row">
          <div className="stat-item">
            <strong>{communities.length}</strong>社區總數
          </div>
          <div className="stat-item">
            <strong>{Object.keys(byCity).length}</strong>涵蓋縣市
          </div>
          <div className="stat-item">
            <strong>{communities.filter(c => Number(c.tx_count ?? 0) > 0).length}</strong>有成交紀錄
          </div>
        </div>

        {Object.entries(byCity).map(([city, comms]) => (
          <div key={city} className="city-sec">
            <div className="city-head">{city} — {comms.length} 個社區</div>
            <div className="comm-grid">
              {comms.map((c, i) => (
                <a
                  key={i}
                  href={`/community/${encodeURIComponent(c.city)}/${encodeURIComponent(c.district)}/${encodeURIComponent(c.name)}`}
                  className="comm-card"
                >
                  <div className="comm-name">{c.name}</div>
                  <div className="comm-addr">{c.addr || `${c.city}${c.district}`}</div>
                  <div className="comm-meta">
                    {c.building_age && <span>屋齡 {c.building_age} 年</span>}
                    {c.units && <span>{c.units} 戶</span>}
                    {c.avg_area && <span>均坪 {c.avg_area}</span>}
                    {Number(c.tx_count ?? 0) > 0 && (
                      <span className="tx-badge">{c.tx_count} 筆成交</span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: '2rem', background: '#1a2a4a', color: '#fff', padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem' }}>
            想了解 {builderName} 建案的實際成交行情？
          </div>
          <a href="/auction" style={{ display: 'inline-block', background: '#c2632a', color: '#fff', fontSize: '.82rem', fontWeight: 500, padding: '.65rem 1.5rem', textDecoration: 'none', borderRadius: 2 }}>
            諮詢我們 →
          </a>
        </div>
      </div>
    </>
  );
}
