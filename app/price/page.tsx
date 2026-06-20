export const revalidate = 86400;
﻿import prismaLvr from '@/lib/prisma-lvr';

export const metadata = {
  title: '全台實價登錄查詢 | 法拍屋資訊平台',
  description: '查詢全台灣各縣市實際成交價格，包含建物、土地、車位交易記錄，資料來源：內政部不動產交易實價登錄。',
};

const SIX_METROS = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
const OTHER_CITIES = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
const ALL_CITIES = [...SIX_METROS, ...OTHER_CITIES];

export default async function LvrPage() {
  // 各縣市統計
  let stats: { city: string; n: number; avg: number | null; latest: string | null }[] = [];
  let hasData = false;

  try {
    const rows = await prismaLvr.$queryRawUnsafe<any[]>(`
      SELECT city,
             COUNT(*) as n,
             AVG(CASE WHEN total_price > 0 THEN total_price END) as avg,
             MAX(tx_date_iso) as latest
      FROM lvr_land
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city
      ORDER BY n DESC
    `);
    stats = rows.map((r: any) => ({
      city:   r.city,
      n:      Number(r.n),
      avg:    r.avg ? Number(r.avg) : null,
      latest: r.latest || null,
    }));
    hasData = stats.length > 0;
  } catch {
    /* lvr_land 表尚未建立（還未匯入資料） */
  }

  const statMap = Object.fromEntries(stats.map(s => [s.city, s]));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1.5rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; font-family: 'Noto Sans TC', sans-serif; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; white-space: nowrap; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .nav-link.active { color: #fff; background: #2a6abf; }
        .hero { background: linear-gradient(135deg, #1e3a6e 0%, #2a5298 100%); padding: clamp(2rem,5vw,3.5rem) clamp(1rem,3vw,2rem); text-align: center; }
        .hero-inner { max-width: 800px; margin: 0 auto; }
        .hero-tag { font-size: .72rem; font-weight: 500; letter-spacing: .2em; color: #93b4e8; margin-bottom: .85rem; }
        .hero-h1 { font-family: 'Noto Serif TC', serif; font-size: clamp(1.5rem,4vw,2.25rem); font-weight: 700; color: #fff; line-height: 1.5; margin-bottom: .85rem; }
        .hero-sub { font-size: .9rem; color: #b8d0f0; font-weight: 300; line-height: 1.9; }
        .content { max-width: 1100px; margin: 0 auto; padding: clamp(1.5rem,4vw,2.5rem) clamp(1rem,3vw,2rem); }
        .section-head { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .6rem 1rem; background: #f0f5ff; margin-bottom: 1.1rem; }
        .city-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 2.5rem; }
        .city-card { background: #fff; border: 1px solid #e0e8f8; padding: 1rem 1.25rem; text-decoration: none; color: inherit; transition: border-color .15s, box-shadow .15s; display: block; }
        .city-card:hover { border-color: #2a5298; box-shadow: 0 2px 12px rgba(42,82,152,.1); }
        .city-card.no-data { opacity: .5; cursor: default; pointer-events: none; border-color: #ececec; }
        .city-name { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 600; color: #1e3a6e; margin-bottom: .4rem; }
        .city-count { font-size: .78rem; color: #2a5298; font-weight: 500; }
        .city-avg { font-size: .75rem; color: #aaa; font-weight: 300; margin-top: .2rem; }
        .city-latest { font-size: .7rem; color: #ccc; font-weight: 300; margin-top: .15rem; }
        .notice { background: #fff8f0; border-left: 4px solid #c2632a; border: 1px solid #f0c4a0; border-left-width: 4px; padding: 1rem 1.25rem; margin-bottom: 2rem; font-size: .82rem; color: #7d4a22; line-height: 1.9; }
        .no-data-box { background: #fff; border: 1px solid #ececec; padding: 3rem 2rem; text-align: center; margin-bottom: 2rem; }
        .cmd-block { background: #f5f5f3; border: 1px solid #e0e0dc; border-radius: 2px; padding: .6rem 1rem; font-family: monospace; font-size: .82rem; color: #555; margin: .5rem 0; }
        @media (max-width: 640px) { .city-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      {/* ── 頂部 Bar ── */}
      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link active">實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="hero">
        <div className="hero-inner">
          <p className="hero-tag">REAL PRICE REGISTRATION · 內政部實價登錄</p>
          <h1 className="hero-h1">全台實際成交價格查詢</h1>
          <p className="hero-sub">
            房屋、土地、車位實際成交記錄 · 資料來源：內政部不動產交易實價登錄<br />
            選擇縣市，查看各行政區真實交易行情
          </p>
        </div>
      </div>

      <div className="content">

        {!hasData && (
          <div className="no-data-box">
            <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: .3 }}>📊</div>
            <p style={{ fontSize: '1rem', color: '#888', marginBottom: '1rem' }}>尚未匯入實價登錄資料</p>
            <p style={{ fontSize: '.85rem', color: '#aaa', lineHeight: 2, marginBottom: '1.5rem' }}>
              請依序執行以下指令，下載並匯入全台資料：
            </p>
            <div className="cmd-block">python download_lvr.py</div>
            <div className="cmd-block">python import_lvr.py</div>
            <p style={{ fontSize: '.75rem', color: '#bbb', marginTop: '1rem' }}>
              或先只匯入現有彰化資料：<code>python import_lvr.py --only-changhua</code>
            </p>
          </div>
        )}

        {/* ── 六都 ── */}
        <div className="section-head">六都直轄市</div>
        <div className="city-grid">
          {SIX_METROS.map(city => {
            const s = statMap[city];
            const avgWan = s?.avg ? Math.round(s.avg / 10000) : null;
            return (
              <a key={city} href={s ? `/price/${encodeURIComponent(city)}` : '#'}
                className={`city-card${!s ? ' no-data' : ''}`}>
                <div className="city-name">{city}</div>
                {s ? (
                  <>
                    <div className="city-count">{s.n.toLocaleString()} 筆交易</div>
                    {avgWan && <div className="city-avg">均 {avgWan.toLocaleString()} 萬</div>}
                    {s.latest && <div className="city-latest">最新 {s.latest}</div>}
                  </>
                ) : (
                  <div className="city-count" style={{ color: '#ccc' }}>尚無資料</div>
                )}
              </a>
            );
          })}
        </div>

        {/* ── 其他縣市 ── */}
        <div className="section-head">其他縣市</div>
        <div className="city-grid">
          {OTHER_CITIES.map(city => {
            const s = statMap[city];
            const avgWan = s?.avg ? Math.round(s.avg / 10000) : null;
            return (
              <a key={city} href={s ? `/price/${encodeURIComponent(city)}` : '#'}
                className={`city-card${!s ? ' no-data' : ''}`}>
                <div className="city-name">{city}</div>
                {s ? (
                  <>
                    <div className="city-count">{s.n.toLocaleString()} 筆交易</div>
                    {avgWan && <div className="city-avg">均 {avgWan.toLocaleString()} 萬</div>}
                    {s.latest && <div className="city-latest">最新 {s.latest}</div>}
                  </>
                ) : (
                  <div className="city-count" style={{ color: '#ccc' }}>尚無資料</div>
                )}
              </a>
            );
          })}
        </div>

        <div className="notice">
          本平台實價登錄資料來源為內政部不動產交易實價登錄開放資料，僅供參考。正式交易請至
          <a href="https://lvr.land.moi.gov.tw/" target="_blank" rel="noopener noreferrer"
            style={{ color: '#2a5298', margin: '0 3px' }}>內政部實價登錄官網</a>
          查詢最新完整資料。
        </div>

      </div>
    </>
  );
}
