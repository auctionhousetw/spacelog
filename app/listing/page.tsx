export const revalidate = 86400;
import prisma from '@/lib/prisma';

export const metadata = {
  title: '買賣掛牌 | 全台房地產資訊平台',
  description: '刊登你的房屋買賣資訊，觸及全台有意購屋的買家。提供法拍、實價、預售行情參考，讓每筆掛牌都有數據支撐。',
};

const FEATURES = [
  { icon: '📊', title: '行情支援', desc: '每筆物件自動帶入同區實價登錄與法拍成交行情，讓買家對比市價更放心出手。' },
  { icon: '🔍', title: '精準曝光', desc: '買家在查同區法拍屋、實價登錄時，掛牌物件自然出現在旁邊，觸及高意圖用戶。' },
  { icon: '🏷️', title: '刊登費透明', desc: '依刊登時長收費，無隱藏佣金，屋主直接與買家聯繫。' },
  { icon: '📍', title: '地圖呈現', desc: '物件位置、鄰近學區、捷運站距離一目了然。' },
];

const WHY_CARDS = [
  { num: '224萬+', label: '實價成交資料', sub: '讓買家對比行情' },
  { num: '1.1萬+', label: '法拍屋物件', sub: '競品行情一眼知' },
  { num: '37萬+', label: '預售成交記錄', sub: '建案價格透明化' },
];

export default async function ListingPage() {
  // 等 listings table 建好後，這裡會顯示最新掛牌
  let recentCount = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as n FROM listings`);
    recentCount = Number(rows[0]?.n || 0);
  } catch { /* listings table 尚未建立 */ }

  const isLive = recentCount > 0;

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

        .hero { background: linear-gradient(135deg, #1a3a2a 0%, #2d6b45 100%); padding: clamp(3rem,7vw,5rem) clamp(1rem,3vw,2rem); text-align: center; color: #fff; }
        .hero-eyebrow { font-size: .72rem; font-weight: 500; letter-spacing: .22em; color: #a8d5b5; margin-bottom: 1rem; }
        .hero-h1 { font-family: 'Noto Serif TC', serif; font-size: clamp(1.6rem,4.5vw,2.4rem); font-weight: 700; line-height: 1.55; margin-bottom: 1rem; }
        .hero-sub { font-size: .9rem; font-weight: 300; line-height: 2; color: rgba(255,255,255,.75); max-width: 520px; margin: 0 auto 2rem; }

        .cta-btn { display: inline-block; padding: .85rem 2.5rem; background: #fff; color: #1a6b3a; font-size: .92rem; font-weight: 700; text-decoration: none; border-radius: 2px; letter-spacing: .04em; transition: all .18s; }
        .cta-btn:hover { background: #f0fdf4; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,.15); }
        .cta-btn-ghost { display: inline-block; padding: .85rem 2.5rem; background: none; color: #fff; font-size: .92rem; font-weight: 500; text-decoration: none; border: 1px solid rgba(255,255,255,.4); border-radius: 2px; letter-spacing: .04em; transition: all .18s; margin-left: 12px; }
        .cta-btn-ghost:hover { background: rgba(255,255,255,.1); }

        .stat-row { display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; margin-top: 2.5rem; }
        .stat-item { text-align: center; }
        .stat-num { font-family: 'Noto Serif TC', serif; font-size: 1.35rem; font-weight: 700; color: #fff; }
        .stat-lbl { font-size: .72rem; color: rgba(255,255,255,.55); margin-top: .15rem; }
        .stat-sub { font-size: .62rem; color: rgba(255,255,255,.4); }

        .wrap { max-width: 900px; margin: 0 auto; padding: clamp(2rem,5vw,3.5rem) clamp(1rem,3vw,2rem) 4rem; }
        .section-head { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #1a6b3a; border-left: 4px solid #1a6b3a; padding: .6rem 1rem; background: #f0fdf4; margin-bottom: 1.25rem; }

        .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1px; background: #d1e8d8; margin-bottom: 2rem; }
        .feature-card { background: #fff; padding: 1.25rem 1.5rem; }
        .feature-icon { font-size: 1.4rem; margin-bottom: .6rem; }
        .feature-title { font-family: 'Noto Serif TC', serif; font-size: .88rem; font-weight: 700; color: #1a3a2a; margin-bottom: .4rem; }
        .feature-desc { font-size: .78rem; color: #888; font-weight: 300; line-height: 1.85; }

        .coming-box { background: #fff; border: 2px dashed #a8d5b5; padding: 2.5rem; text-align: center; margin-bottom: 2rem; }
        .coming-title { font-family: 'Noto Serif TC', serif; font-size: 1.1rem; font-weight: 700; color: #1a6b3a; margin-bottom: .6rem; }
        .coming-sub { font-size: .85rem; color: #888; font-weight: 300; line-height: 1.9; margin-bottom: 1.5rem; }

        .register-form { display: flex; flex-direction: column; gap: .65rem; max-width: 460px; margin: 0 auto; text-align: left; }
        .form-label { font-size: .75rem; color: #555; font-weight: 500; margin-bottom: .15rem; }
        .form-input { width: 100%; padding: .6rem .85rem; border: 1px solid #c8dfc8; border-radius: 2px; font-size: .85rem; font-family: 'Noto Sans TC', sans-serif; color: #333; outline: none; }
        .form-input:focus { border-color: #1a6b3a; box-shadow: 0 0 0 2px rgba(26,107,58,.1); }
        .form-submit { background: #1a6b3a; color: #fff; border: none; padding: .7rem 1.5rem; font-size: .85rem; font-weight: 500; font-family: 'Noto Sans TC', sans-serif; cursor: pointer; border-radius: 2px; letter-spacing: .06em; transition: background .15s; width: 100%; }
        .form-submit:hover { background: #14542e; }

        .how-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; counter-reset: steps; }
        .how-step { counter-increment: steps; }
        .step-num { font-family: 'Noto Serif TC', serif; font-size: 2rem; font-weight: 700; color: #d1e8d8; line-height: 1; margin-bottom: .4rem; }
        .step-title { font-size: .82rem; font-weight: 600; color: #1a3a2a; margin-bottom: .25rem; }
        .step-desc { font-size: .75rem; color: #aaa; font-weight: 300; line-height: 1.7; }

        @media(max-width:640px){ .stat-row { gap: 1.25rem; } .cta-btn-ghost { margin-left: 0; margin-top: 8px; } }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price"   className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      {/* Hero */}
      <div className="hero">
        <p className="hero-eyebrow">LISTING · 買賣掛牌</p>
        <h1 className="hero-h1">
          讓你的物件出現在<br />
          正在查行情的買家眼前
        </h1>
        <p className="hero-sub">
          買家查同區法拍屋底價、實價登錄均價的當下，<br />
          就能看到你的掛牌——精準觸及高意圖用戶。
        </p>
        <div>
          <a href="#register" className="cta-btn">免費登記搶先體驗</a>
          <a href="/price" className="cta-btn-ghost">先看行情</a>
        </div>
        <div className="stat-row">
          {WHY_CARDS.map(c => (
            <div key={c.num} className="stat-item">
              <div className="stat-num">{c.num}</div>
              <div className="stat-lbl">{c.label}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="wrap">

        {/* 功能特色 */}
        <div className="section-head">為什麼選擇在這裡掛牌？</div>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* 掛牌流程 */}
        <div className="section-head">掛牌流程</div>
        <div className="how-steps">
          {[
            { n: '01', t: '填寫物件資訊', d: '地址、坪數、格局、屋齡、售價，5 分鐘填完。' },
            { n: '02', t: '審核上線',      d: '平台確認資訊後，24 小時內上架曝光。' },
            { n: '03', t: '買家查詢接觸',  d: '買家在查同區行情時看到你的物件，直接聯繫。' },
            { n: '04', t: '成交報告',      d: '系統記錄帶看次數與詢問數，隨時掌握反應。' },
          ].map(s => (
            <div key={s.n} className="how-step">
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.t}</div>
              <div className="step-desc">{s.d}</div>
            </div>
          ))}
        </div>

        {/* 目前狀態：等待 listings table 或已上線 */}
        <div id="register" className="coming-box">
          {isLive ? (
            <>
              <div className="coming-title">已有 {recentCount.toLocaleString()} 筆掛牌物件</div>
              <div className="coming-sub">掛牌功能開放中，填寫以下資訊即可刊登。</div>
            </>
          ) : (
            <>
              <div className="coming-title">搶先體驗名單募集中</div>
              <div className="coming-sub">
                掛牌功能即將上線。留下聯絡資訊，功能開放時優先通知，<br />
                前 100 名享首月免費刊登。
              </div>
            </>
          )}

          {/* 簡易登記表單（mailto 送信） */}
          <form className="register-form" action="mailto:briskbreeze5@gmail.com" method="post" encType="text/plain">
            <div>
              <div className="form-label">物件地址（可填區域即可）</div>
              <input className="form-input" type="text" name="address" placeholder="例：台北市大安區 or 台中市北區XX路" required />
            </div>
            <div>
              <div className="form-label">聯絡電話或 Email</div>
              <input className="form-input" type="text" name="contact" placeholder="0912-345-678 or email@example.com" required />
            </div>
            <div>
              <div className="form-label">希望售價（萬元，選填）</div>
              <input className="form-input" type="text" name="price" placeholder="例：1200 萬" />
            </div>
            <button type="submit" className="form-submit">
              {isLive ? '提交掛牌資訊' : '登記搶先體驗'}
            </button>
          </form>
        </div>

        {/* 行情工具導引 */}
        <div className="section-head">掛牌前先看行情</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 8 }}>
          {[
            { href: '/price',   label: '查實價登錄', sub: '同區近期成交均價',  color: '#2a5298', bg: '#f0f5ff', border: '#b8d0f0' },
            { href: '/auction', label: '看法拍行情', sub: '法拍底價 vs 市價',   color: '#c2632a', bg: '#fff8f4', border: '#f0c4a0' },
            { href: '/presale', label: '比較預售建案', sub: '同區預售成交記錄', color: '#1a6b3a', bg: '#f0fdf4', border: '#a8d5b5' },
            { href: '/compare', label: '行政區比較', sub: '各區均價橫向對照',  color: '#2a5298', bg: '#f0f5ff', border: '#b8d0f0' },
          ].map(c => (
            <a key={c.href} href={c.href}
              style={{ display: 'block', background: c.bg, border: `1px solid ${c.border}`, padding: '.85rem 1.1rem', textDecoration: 'none', transition: 'box-shadow .15s' }}>
              <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: c.color, marginBottom: '.25rem' }}>{c.label}</div>
              <div style={{ fontSize: '.72rem', color: '#888', fontWeight: 300 }}>{c.sub}</div>
            </a>
          ))}
        </div>

      </div>

      <footer style={{ background: '#fff', borderTop: '1px solid #ececec', padding: '1.5rem clamp(1rem,3vw,2rem)', textAlign: 'center', marginTop: '2rem' }}>
        <p style={{ fontSize: '.75rem', color: '#bbb', fontWeight: 300, margin: 0 }}>
          買賣掛牌功能由「法拍屋資訊平台」提供。刊登費用與規格以正式上線公告為準。
        </p>
        <p style={{ marginTop: '.5rem' }}>
          <a href="/about" style={{ fontSize: '.75rem', color: '#ccc', textDecoration: 'none', margin: '0 .5rem' }}>關於本站</a>
          <a href="/privacy" style={{ fontSize: '.75rem', color: '#ccc', textDecoration: 'none', margin: '0 .5rem' }}>隱私權政策</a>
        </p>
      </footer>
    </>
  );
}
