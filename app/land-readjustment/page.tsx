export const revalidate = 86400;
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '重劃區資訊 | 公辦市地重劃完整資料',
  description: '台灣各縣市公辦市地重劃區完整資訊，包含各期期別、行政區範圍、法拍物件、預售建案、實價行情。台中1期至16期、北屯、西屯、南屯、大里等重劃區一覽。',
  alternates: { canonical: '/land-readjustment' },
};

const CITIES = [
  {
    city: '台中',
    periods: [
      { slug: '7期', name: '惠來重劃區', districts: '西屯區、南屯區', hot: true },
      { slug: '14期', name: '美和庄重劃區', districts: '北屯區', hot: true },
      { slug: '10期', name: '軍功水景重劃區', districts: '北屯區', hot: true },
      { slug: '11期', name: '四張犁重劃區', districts: '北屯區', hot: false },
      { slug: '12期', name: '福星重劃區', districts: '西屯區', hot: false },
      { slug: '13期', name: '大慶重劃區', districts: '南區、南屯區', hot: false },
      { slug: '15期', name: '大里杙重劃區', districts: '大里區', hot: false },
    ],
  },
];

export default function RezoningPage() {
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
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .city-sec { margin-bottom: 2.5rem; }
        .city-head { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .5rem 1rem; background: #f0f5ff; margin-bottom: 1rem; }
        .period-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: .75rem; }
        .period-card { background: #fff; border: 1px solid #e8ecf5; padding: 1rem 1.25rem; text-decoration: none; display: block; transition: all .15s; }
        .period-card:hover { border-color: #2a5298; box-shadow: 0 2px 8px rgba(42,82,152,.1); transform: translateY(-1px); }
        .period-card.hot { border-left: 3px solid #c2632a; }
        .period-slug { font-family: 'Noto Serif TC', serif; font-size: 1.1rem; font-weight: 700; color: #1a2a4a; }
        .period-name { font-size: .78rem; color: #888; margin-top: .2rem; }
        .period-dist { font-size: .72rem; color: #2a5298; margin-top: .4rem; }
        .hot-badge { display: inline-block; font-size: .62rem; background: #fff3ee; color: #c2632a; border: 1px solid #f0c4a0; padding: .1rem .4rem; border-radius: 2px; margin-left: .4rem; vertical-align: middle; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/land-readjustment" className="nav-link" style={{ color: '#7b5ea7' }}>重劃區</a>
          <a href="/price"   className="nav-link">實價登錄</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/presale" className="nav-link">預售屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#7b5ea7', marginBottom: '.4rem' }}>LAND READJUSTMENT · 重劃區</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            公辦市地重劃區資訊
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            各期重劃區的法拍物件、預售建案、實價成交行情整合查詢。
          </p>
        </div>
      </div>

      <div className="wrap">
        {CITIES.map(({ city, periods }) => (
          <div key={city} className="city-sec">
            <div className="city-head">{city}市 — 公辦市地重劃區</div>
            <div className="period-grid">
              {periods.map(({ slug, name, districts, hot }) => (
                <a key={slug} href={`/land-readjustment/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`}
                  className={`period-card${hot ? ' hot' : ''}`}>
                  <div className="period-slug">
                    {city}{slug}
                    {hot && <span className="hot-badge">熱門</span>}
                  </div>
                  <div className="period-name">{name}</div>
                  <div className="period-dist">📍 {districts}</div>
                </a>
              ))}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <a href={`/land-readjustment/${encodeURIComponent(city)}`}
                style={{ fontSize: '.78rem', color: '#2a5298', textDecoration: 'none', borderBottom: '1px solid #c8d8f0' }}>
                查看 {city}市全部 16 期 →
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
