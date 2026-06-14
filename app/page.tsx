import { PrismaClient } from '@prisma/client';
import { AddressSearchBox } from './components/AddressSearchBox';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

export const metadata = {
  title: '法拍屋・實價登錄 | 全台房地產資訊平台',
  description: '全台最完整的法拍屋查詢與實價登錄資料庫。瀏覽最新開標資訊、底價分析、周邊成交行情，一站掌握台灣房地產市場。',
};

const SIX_METROS  = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
const OTHER_CITIES = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

function statusStyle(status: string | null): React.CSSProperties {
  if (!status) return { background: '#f5f5f3', color: '#aaa', border: '1px solid #e8e8e4' };
  if (status.includes('待標') || status.includes('應買'))
    return { background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' };
  if (status.includes('拍定') || status.includes('成交'))
    return { background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' };
  return { background: '#f5f5f3', color: '#888', border: '1px solid #e8e8e4' };
}

export default async function HomePage() {
  // ── 統計資料 ──────────────────────────────────────────────────────────────
  let auctionTotal = 0, auctionRecent = 0;
  let lvrTotal = 0, presaleTotal = 0;
  let recentHouses: any[] = [];
  let cityStats: { city: string; n: number }[] = [];
  let presaleCityStats: { city: string; n: number }[] = [];

  try {
    const [aStats, lStats, pStats, recent, cities, presaleCities] = await Promise.all([
      // 法拍統計
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN auction_date >= to_char(CURRENT_DATE - INTERVAL '14 days', 'YYYY-MM-DD') THEN 1 END) as recent
         FROM houses`
      ),
      // 實價統計
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as total FROM lvr_land`
      ).catch(() => [{ total: 0 }]),
      // 預售統計
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as total FROM lvr_presale`
      ).catch(() => [{ total: 0 }]),
      // 最新法拍（精選 + 最新開標）
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, address, price, area, unit_price, auction_date,
                type, status, auction_round, delivery, city, district, is_agent_featured
         FROM houses
         WHERE auction_date IS NOT NULL AND auction_date != ''
         ORDER BY CASE WHEN is_agent_featured=1 THEN 0 ELSE 1 END,
                  auction_date DESC
         LIMIT 8`
      ),
      // 縣市法拍筆數
      prisma.$queryRawUnsafe<any[]>(
        `SELECT city, COUNT(*) as n FROM houses
         WHERE city IS NOT NULL AND city != ''
         GROUP BY city ORDER BY n DESC`
      ),
      // 縣市預售筆數
      prisma.$queryRawUnsafe<any[]>(
        `SELECT city, COUNT(*) as n FROM lvr_presale
         WHERE city IS NOT NULL AND city != ''
         GROUP BY city ORDER BY n DESC`
      ).catch(() => []),
    ]);

    auctionTotal      = Number(aStats[0]?.total  || 0);
    auctionRecent     = Number(aStats[0]?.recent || 0);
    lvrTotal          = Number(lStats[0]?.total || 0);
    presaleTotal      = Number(pStats[0]?.total || 0);
    recentHouses      = recent;
    cityStats         = cities.map((r: any) => ({ city: r.city, n: Number(r.n) }));
    presaleCityStats  = presaleCities.map((r: any) => ({ city: r.city, n: Number(r.n) }));
  } catch { /* DB 未就緒 */ }

  const cityMap        = Object.fromEntries(cityStats.map(s => [s.city, s.n]));
  const presaleCityMap = Object.fromEntries(presaleCityStats.map(s => [s.city, s.n]));

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: var(--font-noto-sans-tc), sans-serif; color: #333; }

        /* ── Header ── */
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; white-space: nowrap; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .nav-link.blue { color: #2a5298; }
        .nav-link.blue:hover { background: #f0f5ff; }

        /* ── Hero ── */
        .hero { background: #fff; border-bottom: 1px solid #ececec; padding: clamp(2.5rem,6vw,4rem) clamp(1rem,3vw,2rem); text-align: center; }
        .hero-eyebrow { font-size: .72rem; font-weight: 500; letter-spacing: .22em; color: #c2632a; margin-bottom: 1rem; }
        .hero-h1 { font-family: var(--font-noto-serif-tc), serif; font-size: clamp(1.6rem,4.5vw,2.5rem); font-weight: 700; color: #222; line-height: 1.55; margin-bottom: 1rem; }
        .hero-sub { font-size: clamp(.85rem,2vw,1rem); color: #888; font-weight: 300; line-height: 1.9; max-width: 560px; margin: 0 auto 2rem; }

        /* ── 頻道卡片 ── */
        .channel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 900px; margin: 0 auto; }
        .channel-card { display: block; padding: 1.5rem 1.75rem; text-decoration: none; color: inherit; border: 1px solid; border-radius: 2px; transition: box-shadow .18s; text-align: left; }
        .channel-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.1); }
        .channel-card.orange { background: #fff8f4; border-color: #f0c4a0; }
        .channel-card.blue   { background: #f0f5ff; border-color: #b8d0f0; }
        .channel-card.purple { background: #f7f4ff; border-color: #c8b8e8; }
        .channel-icon { font-size: 1.6rem; margin-bottom: .6rem; }
        .channel-label { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; margin-bottom: .35rem; }
        .channel-card.orange .channel-label { color: #c2632a; }
        .channel-card.blue   .channel-label { color: #2a5298; }
        .channel-card.purple .channel-label { color: #7b5ea7; }
        .channel-count { font-size: .78rem; color: #aaa; font-weight: 300; }
        .channel-cta { font-size: .78rem; font-weight: 500; margin-top: .75rem; }
        .channel-card.orange .channel-cta { color: #c2632a; }
        .channel-card.blue   .channel-cta { color: #2a5298; }
        .channel-card.purple .channel-cta { color: #7b5ea7; }

        /* ── 全站統計 ── */
        .stats-strip { background: #fff; border-top: 1px solid #ececec; border-bottom: 1px solid #ececec; }
        .stats-inner { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); }
        .stat-cell { padding: 1.1rem clamp(.75rem,2vw,1.5rem); text-align: center; border-right: 1px solid #f0f0f0; }
        .stat-cell:last-child { border-right: none; }
        .stat-val { font-family: var(--font-noto-serif-tc), serif; font-size: 1.35rem; font-weight: 700; color: #c2632a; line-height: 1.2; }
        .stat-label { font-size: .72rem; color: #aaa; font-weight: 300; margin-top: .2rem; letter-spacing: .04em; }

        /* ── 主體 ── */
        .wrap { max-width: 1100px; margin: 0 auto; padding: clamp(1.5rem,4vw,2.5rem) clamp(1rem,3vw,2rem); }

        /* ── 區段標題 ── */
        .sec-head { font-family: var(--font-noto-serif-tc), serif; font-size: 1rem; font-weight: 700; color: #c2632a; border-left: 4px solid #c2632a; padding: .6rem 1rem; background: #fff8f4; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; }
        .sec-head a { font-size: .78rem; font-weight: 400; color: #c2632a; text-decoration: none; }
        .sec-head a:hover { text-decoration: underline; }

        /* ── 法拍物件卡 ── */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin-bottom: 2rem; }
        .house-card { background: #fff; border: 1px solid #ececec; padding: 1rem 1.1rem; text-decoration: none; color: inherit; transition: box-shadow .18s; display: block; }
        .house-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
        .house-card:hover .card-title { color: #c2632a; }
        .card-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: .5rem; }
        .badge { font-size: 9.5px; font-weight: 500; padding: .16rem .5rem; border-radius: 1px; }
        .card-title { font-family: var(--font-noto-serif-tc), serif; font-size: .88rem; font-weight: 500; color: #333; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: .4rem; transition: color .15s; }
        .card-meta { font-size: .72rem; color: #aaa; font-weight: 300; }
        .card-price { font-family: var(--font-noto-serif-tc), serif; font-size: 1.15rem; font-weight: 700; color: #c2632a; margin-top: .5rem; }
        .card-price small { font-size: .68rem; font-weight: 400; margin-left: 2px; }

        /* ── 縣市快速入口 ── */
        .city-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px; margin-bottom: 2rem; }
        .city-btn { display: block; background: #fff; border: 1px solid #ececec; padding: .7rem 1rem; text-decoration: none; color: #555; font-size: .82rem; transition: all .15s; }
        .city-btn:hover { border-color: #c2632a; color: #c2632a; background: #fff8f4; }
        .city-btn .n { float: right; font-size: .7rem; color: #ccc; font-weight: 300; }

        /* ── 地址搜尋框 ── */
        .addr-search-wrap { max-width: 560px; width: 100%; margin: 1.75rem auto 0; overflow: hidden; }
        .addr-search-label { font-size: .76rem; color: #aaa; font-weight: 300; margin-bottom: .5rem; letter-spacing: .04em; }

        /* ── 藍色縣市按鈕 ── */
        .city-btn-blue { border-color: #b8d0f0; color: #2a5298; }
        .city-btn-blue:hover { border-color: #2a5298; color: #2a5298; background: #f0f5ff; }
        .sec-head-blue { font-family: var(--font-noto-serif-tc), serif; font-size: 1rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .6rem 1rem; background: #f0f5ff; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; }
        .sec-head-blue a { font-size: .78rem; font-weight: 400; color: #2a5298; text-decoration: none; }
        .sec-head-blue a:hover { text-decoration: underline; }

        /* ── 底部 ── */
        .footer { background: #fff; border-top: 1px solid #ececec; padding: 2rem clamp(1rem,3vw,2rem); text-align: center; margin-top: 3rem; }
        .footer p { font-size: .78rem; color: #bbb; font-weight: 300; line-height: 1.9; margin: 0; }

        @media (max-width: 640px) {
          .channel-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .channel-card { padding: 1rem 1rem; }
          .channel-label { font-size: .92rem; }
          .stats-inner  { grid-template-columns: 1fr 1fr; }
          .stat-cell:nth-child(2) { border-right: none; }
          .stat-cell:nth-child(3) { border-right: 1px solid #f0f0f0; }
          .card-grid { grid-template-columns: 1fr; }
          /* 手機 nav：隱藏次要連結，避免溢出 */
          .nav-hide-sm { display: none; }
          .site-bar-inner { gap: .5rem; }
          .nav-link { padding: .3rem .45rem; font-size: .78rem; }
        }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house'}/#website`,
            url: process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house',
            name: '法拍屋・實價登錄・預售屋 | 全台房地產資訊平台',
            inLanguage: 'zh-TW',
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house'}/community/search?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'Organization',
            '@id': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house'}/#organization`,
            name: '法拍屋資訊平台',
            url: process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house',
            description: '全台最完整的法拍屋查詢、實價登錄與預售屋成交資料庫。',
          },
        ],
      }) }} />

      {/* ── Header ── */}
      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction"  className="nav-link">法拍屋</a>
          <a href="/price"    className="nav-link blue">實價登錄</a>
          <a href="/presale"  className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/land-readjustment"    className="nav-link nav-hide-sm" style={{ color: '#7b5ea7' }}>重劃區</a>
          <a href="/special-properties"  className="nav-link nav-hide-sm" style={{ color: '#c2632a' }}>特殊物件</a>
          <a href="/compare"             className="nav-link nav-hide-sm" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="hero">
        <p className="hero-eyebrow">TAIWAN REAL ESTATE · 全台房地產資訊平台</p>
        <h1 className="hero-h1">法拍屋 · 實價登錄 · 預售屋<br />全台房地產資料一站查</h1>
        <p className="hero-sub">
          法拍底價走勢、周邊實際成交行情、建案預售記錄，
          三大資料庫整合查詢，讓每一個房產決策都有數據支撐。
        </p>

        {/* 兩大頻道入口 */}
        <div className="channel-grid">
          <a href="/auction" className="channel-card orange">
            <div className="channel-icon">🏛️</div>
            <div className="channel-label">法拍屋</div>
            <div className="channel-count">{auctionTotal.toLocaleString()} 筆物件</div>
            <div className="channel-cta">瀏覽最新開標 →</div>
          </a>
          <a href="/price" className="channel-card blue">
            <div className="channel-icon">📊</div>
            <div className="channel-label">實價登錄</div>
            <div className="channel-count">{lvrTotal > 0 ? `${lvrTotal.toLocaleString()} 筆成交` : '全台成交記錄'}</div>
            <div className="channel-cta">查詢成交行情 →</div>
          </a>
          <a href="/presale" className="channel-card" style={{ background: '#f0fdf4', borderColor: '#a8d5b5' }}>
            <div className="channel-icon">🏗️</div>
            <div className="channel-label" style={{ color: '#1a6b3a' }}>預售屋</div>
            <div className="channel-count">全台建案成交記錄</div>
            <div className="channel-cta" style={{ color: '#1a6b3a' }}>查詢建案行情 →</div>
          </a>
          <a href="/land-readjustment" className="channel-card purple">
            <div className="channel-icon">🗺️</div>
            <div className="channel-label">重劃區</div>
            <div className="channel-count">台中市 1–16 期完整資料</div>
            <div className="channel-cta">查看法拍・預售・行情 →</div>
          </a>
        </div>

        {/* 地址搜尋 */}
        <div className="addr-search-wrap">
          <p className="addr-search-label">按地址查歷年實價成交記錄</p>
          <AddressSearchBox />
        </div>
      </div>

      {/* ── 統計列 ── */}
      <div className="stats-strip">
        <div className="stats-inner">
          <div className="stat-cell">
            <div className="stat-val">{auctionTotal.toLocaleString()}</div>
            <div className="stat-label">法拍物件總數</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val">{auctionRecent.toLocaleString()}</div>
            <div className="stat-label">近兩週新增</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val" style={{ color: '#2a5298' }}>{lvrTotal > 0 ? (lvrTotal / 10000).toFixed(0) + '萬+' : '—'}</div>
            <div className="stat-label">實價成交筆數</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val" style={{ color: '#1a6b3a' }}>{presaleTotal > 0 ? presaleTotal.toLocaleString() : '—'}</div>
            <div className="stat-label">預售成交筆數</div>
          </div>
        </div>
      </div>

      <div className="wrap">

        {/* ── 最新法拍物件 ── */}
        {recentHouses.length > 0 && (
          <section>
            <div className="sec-head">
              最新法拍物件
              <a href="/auction">查看全部 {auctionTotal.toLocaleString()} 筆 →</a>
            </div>
            <div className="card-grid">
              {recentHouses.map((h: any) => {
                const priceWan = h.price ? Math.floor(h.price / 10000) : null;
                const href = `/auction/${encodeURIComponent(h.city || '未知縣市')}/${encodeURIComponent(h.district || '未知區域')}/${h.id}`;
                const badgeS = statusStyle(h.status);
                return (
                  <a key={h.id} href={href} className="house-card">
                    <div className="card-badges">
                      {h.is_agent_featured == 1 && (
                        <span className="badge" style={{ background: 'linear-gradient(90deg,#c2632a,#e07340)', color: '#fff' }}>★ 精選</span>
                      )}
                      {h.type && (
                        <span className="badge" style={{ background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' }}>{h.type}</span>
                      )}
                      {h.status && (
                        <span className="badge" style={badgeS}>{h.status}</span>
                      )}
                      {h.auction_round && (
                        <span className="badge" style={{ background: '#fafafa', color: '#aaa', border: '1px solid #e8e8e4' }}>{h.auction_round}</span>
                      )}
                    </div>
                    <div className="card-title">{h.title || h.address || '（無標題）'}</div>
                    <div className="card-meta">
                      📍 {h.city}{h.district}
                      {h.area ? ` · ${h.area} 坪` : ''}
                      {h.auction_date ? ` · 開標 ${h.auction_date}` : ''}
                    </div>
                    <div className="card-price">
                      {priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}
                      {h.unit_price ? <small style={{ marginLeft: 8, fontSize: '.68rem', color: '#c2632a' }}>{h.unit_price} 萬/坪</small> : null}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 縣市快速入口：法拍 ── */}
        <section>
          <div className="sec-head">依縣市瀏覽法拍屋</div>
          <div className="city-grid">
            {[...SIX_METROS, ...OTHER_CITIES].map(city => (
              <a key={city} href={`/auction?city=${encodeURIComponent(city)}`} className="city-btn">
                {city}
                {cityMap[city] ? <span className="n">{cityMap[city]}</span> : null}
              </a>
            ))}
          </div>
        </section>

        {/* ── 縣市快速入口：實價登錄 ── */}
        <section>
          <div className="sec-head-blue">
            依縣市查實價登錄
            <a href="/price">查看全台 →</a>
          </div>
          <div className="city-grid">
            {[...SIX_METROS, ...OTHER_CITIES].map(city => (
              <a key={city} href={`/price/${encodeURIComponent(city)}`} className="city-btn city-btn-blue">
                {city}
              </a>
            ))}
          </div>
        </section>

        {/* ── 縣市快速入口：預售屋 ── */}
        <section>
          <div className="sec-head" style={{ color: '#1a6b3a', borderLeftColor: '#1a6b3a', background: '#f0fdf4' }}>
            依縣市查預售建案
            <a href="/presale" style={{ color: '#1a6b3a' }}>查看全台 →</a>
          </div>
          <div className="city-grid">
            {[...SIX_METROS, ...OTHER_CITIES].map(city => (
              <a key={city} href={`/presale/${encodeURIComponent(city)}`}
                className="city-btn"
                style={{ borderColor: presaleCityMap[city] ? '#a8d5b5' : undefined, color: presaleCityMap[city] ? '#1a6b3a' : '#ccc' }}>
                {city}
                {presaleCityMap[city] ? <span className="n" style={{ color: '#a8d5b5' }}>{presaleCityMap[city].toLocaleString()}</span> : null}
              </a>
            ))}
          </div>
        </section>

        {/* ── 台中重劃區快速入口 ── */}
        <section>
          <div className="sec-head" style={{ color: '#7b5ea7', borderLeftColor: '#7b5ea7', background: '#f7f4ff' }}>
            台中市重劃區
            <a href="/land-readjustment/台中" style={{ color: '#7b5ea7' }}>查看全部 16 期 →</a>
          </div>
          <div className="city-grid">
            {[
              { slug: '7期',  name: '惠來・西屯/南屯' },
              { slug: '14期', name: '美和庄・北屯' },
              { slug: '10期', name: '軍功水景・北屯' },
              { slug: '11期', name: '四張犁・北屯' },
              { slug: '13期', name: '大慶・南區/南屯' },
              { slug: '12期', name: '福星・西屯' },
              { slug: '5期',  name: '大墩・南屯/西屯' },
              { slug: '8期',  name: '豐樂・南屯' },
              { slug: '15期', name: '大里杙・大里' },
              { slug: '4期',  name: '中正東山・北區' },
            ].map(({ slug, name }) => (
              <a key={slug} href={`/land-readjustment/台中/${encodeURIComponent(slug)}`}
                className="city-btn"
                style={{ borderColor: '#c8b8e8', color: '#7b5ea7' }}>
                台中{slug}
                <span className="n" style={{ color: '#c8b8e8', fontSize: '.65rem' }}>{name.split('・')[0]}</span>
              </a>
            ))}
          </div>
        </section>

      </div>

      {/* ── 底部 ── */}
      <footer className="footer">
        <p>
          本平台資料來源為司法院、內政部不動產交易實價登錄，僅供參考。<br />
          投標前請至司法院官網確認最新底價與開標資訊。
        </p>
      </footer>
    </>
  );
}
