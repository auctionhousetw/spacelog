import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '關於本站 | 法拍屋資訊平台',
  description: 'spacelog.tw 是整合司法院法拍公告與內政部實價登錄的房地產資訊平台，協助民眾查詢法拍屋底價、比較周邊行情。',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: var(--font-noto-sans-tc), sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #ad5620; text-decoration: none; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #767676; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #555; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .page-wrap { max-width: 760px; margin: 0 auto; padding: clamp(2rem,6vw,4rem) clamp(1rem,3vw,2rem); }
        .breadcrumb { font-size: .78rem; color: #999; margin-bottom: 1.5rem; }
        .breadcrumb a { color: #999; text-decoration: none; }
        .breadcrumb a:hover { color: #ad5620; }
        h1 { font-family: var(--font-noto-serif-tc), serif; font-size: clamp(1.4rem,3.5vw,1.9rem); font-weight: 700; color: #222; margin: 0 0 2rem; }
        .prose { background: #fff; border: 1px solid #ececec; border-radius: 2px; padding: 2rem 2.25rem; line-height: 1.9; }
        .prose h2 { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #222; margin: 2rem 0 .75rem; padding-bottom: .4rem; border-bottom: 1px solid #f0ebe6; }
        .prose h2:first-child { margin-top: 0; }
        .prose p { font-size: .92rem; color: #444; margin: 0 0 1rem; }
        .prose ul { font-size: .92rem; color: #444; margin: 0 0 1rem; padding-left: 1.4rem; }
        .prose ul li { margin-bottom: .35rem; }
        .source-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin: 1rem 0; }
        .source-card { background: #f9f7f4; border: 1px solid #ece8e3; border-radius: 2px; padding: .9rem 1.1rem; }
        .source-card-title { font-weight: 600; font-size: .88rem; color: #333; margin-bottom: .35rem; }
        .source-card-desc { font-size: .8rem; color: #666; line-height: 1.6; }
        .disclaimer { background: #fff8f4; border: 1px solid #f0c4a0; border-radius: 2px; padding: .9rem 1.1rem; font-size: .85rem; color: #7a3d12; line-height: 1.7; margin-top: 1rem; }
        footer { background: #fff; border-top: 1px solid #ececec; padding: 1.5rem clamp(1rem,3vw,2rem); text-align: center; margin-top: 3rem; }
        footer p { font-size: .78rem; color: #aaa; margin: 0; }
        footer a { color: #aaa; text-decoration: none; margin: 0 .5rem; }
        footer a:hover { color: #ad5620; }
        @media (max-width: 560px) { .source-grid { grid-template-columns: 1fr; } }
      `}</style>

      <nav className="site-bar">
        <div className="site-bar-inner">
          <Link href="/" className="site-logo">
            法拍屋資訊平台 <span>spacelog.tw</span>
          </Link>
          <Link href="/auction" className="nav-link">法拍屋</Link>
          <Link href="/price" className="nav-link">實價登錄</Link>
          <Link href="/community" className="nav-link">社區大樓</Link>
        </div>
      </nav>

      <div className="page-wrap">
        <p className="breadcrumb"><Link href="/">首頁</Link> › 關於本站</p>
        <h1>關於法拍屋資訊平台</h1>

        <div className="prose">
          <h2>平台介紹</h2>
          <p>
            spacelog.tw 是一個整合多元房地產資訊的查詢平台，將政府公開資料轉化為易讀、易用的格式，協助一般民眾在資訊透明的環境下做出更好的房產決策。
          </p>
          <p>
            無論您是考慮投標法拍屋的首次買家、研究周邊行情的自住客，或是追蹤社區大樓歷年成交記錄的投資人，本平台都能提供一站式的資訊查詢體驗。
          </p>

          <h2>資料來源</h2>
          <div className="source-grid">
            <div className="source-card">
              <div className="source-card-title">司法院法院拍賣公告</div>
              <div className="source-card-desc">全台法院公告的法拍物件，含底價、開標日、點交情形等完整資訊。</div>
            </div>
            <div className="source-card">
              <div className="source-card-title">內政部實價登錄</div>
              <div className="source-card-desc">2012 年迄今全台買賣、預售屋成交記錄，政府強制申報的真實成交資料。</div>
            </div>
            <div className="source-card">
              <div className="source-card-title">政府開放資料</div>
              <div className="source-card-desc">重劃區案件、逾期未辦繼承土地、管委會登記等各縣市政府公告資料。</div>
            </div>
            <div className="source-card">
              <div className="source-card-title">社區大樓資訊</div>
              <div className="source-card-desc">整合多來源的社區名稱、戶數、屋齡等基本建物資訊（來源：政府建管局）。</div>
            </div>
          </div>

          <h2>免責聲明</h2>
          <p>本平台所有資料均來自政府公開資料庫，僅供參考用途。</p>
          <div className="disclaimer">
            法拍屋投標前，請務必至<strong>司法院官方網站</strong>確認最新底價、開標時間及物件狀況。<br />
            本平台對資料的即時性、完整性不負擔保責任，亦不提供任何投資建議。
          </div>

          <h2>聯絡我們</h2>
          <p>如有資料錯誤回報、合作洽詢或其他問題，歡迎來信：<a href="mailto:briskbreeze5@gmail.com" style={{ color: '#ad5620' }}>briskbreeze5@gmail.com</a></p>
        </div>
      </div>

      <footer>
        <p>
          <Link href="/">首頁</Link>
          <Link href="/about">關於本站</Link>
          <Link href="/privacy">隱私權政策</Link>
        </p>
      </footer>
    </>
  );
}
