import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '隱私權政策 | 法拍屋資訊平台',
  description: '法拍屋資訊平台（spacelog.tw）的隱私權政策，說明資料收集、使用方式及用戶權利。',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
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
        h1 { font-family: var(--font-noto-serif-tc), serif; font-size: clamp(1.4rem,3.5vw,1.9rem); font-weight: 700; color: #222; margin: 0 0 .5rem; }
        .updated { font-size: .8rem; color: #999; margin-bottom: 2.5rem; }
        .prose { background: #fff; border: 1px solid #ececec; border-radius: 2px; padding: 2rem 2.25rem; line-height: 1.9; }
        .prose h2 { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #222; margin: 2rem 0 .75rem; padding-bottom: .4rem; border-bottom: 1px solid #f0ebe6; }
        .prose h2:first-child { margin-top: 0; }
        .prose p { font-size: .92rem; color: #444; margin: 0 0 1rem; }
        .prose ul { font-size: .92rem; color: #444; margin: 0 0 1rem; padding-left: 1.4rem; }
        .prose ul li { margin-bottom: .35rem; }
        .prose a { color: #ad5620; }
        footer { background: #fff; border-top: 1px solid #ececec; padding: 1.5rem clamp(1rem,3vw,2rem); text-align: center; margin-top: 3rem; }
        footer p { font-size: .78rem; color: #aaa; margin: 0; }
        footer a { color: #aaa; text-decoration: none; margin: 0 .5rem; }
        footer a:hover { color: #ad5620; }
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
        <p className="breadcrumb"><Link href="/">首頁</Link> › 隱私權政策</p>
        <h1>隱私權政策</h1>
        <p className="updated">最後更新：2026 年 6 月</p>

        <div className="prose">
          <h2>一、適用範圍</h2>
          <p>本隱私權政策適用於法拍屋資訊平台（spacelog.tw，以下稱「本平台」）所提供的網站服務。當您使用本平台時，表示您同意本政策的內容。</p>

          <h2>二、資料收集</h2>
          <p>本平台可能收集以下資訊：</p>
          <ul>
            <li><strong>瀏覽記錄</strong>：包括您瀏覽的頁面、停留時間、來源網址等，用於了解使用狀況與改善服務。</li>
            <li><strong>裝置資訊</strong>：瀏覽器類型、作業系統、IP 位址等技術資訊（已去識別化處理）。</li>
            <li><strong>Cookie</strong>：本平台使用 Cookie 記錄您的偏好設定（如搜尋條件），以提升使用體驗。您可透過瀏覽器設定管理或停用 Cookie。</li>
          </ul>
          <p>本平台<strong>不會</strong>要求您提供姓名、身分證字號或財務資訊，也不會在未經同意的情況下蒐集個人識別資料。</p>

          <h2>三、資料使用目的</h2>
          <p>所收集的資料僅用於：</p>
          <ul>
            <li>改善網站功能與用戶體驗</li>
            <li>分析瀏覽行為以優化內容</li>
            <li>維護系統安全與防範惡意存取</li>
          </ul>

          <h2>四、第三方服務</h2>
          <p>本平台使用以下第三方服務，各服務有其獨立的隱私權政策：</p>
          <ul>
            <li><strong>Google Analytics</strong>：網站流量分析，資料由 Google 處理，詳見 <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 隱私權政策</a>。</li>
            <li><strong>Vercel</strong>：網站託管服務，伺服器記錄存放於 Vercel 平台。</li>
          </ul>

          <h2>五、資料保存與安全</h2>
          <p>本平台採取合理的技術措施保護您的資料，包括 HTTPS 加密傳輸。然而，網際網路傳輸無法保證百分之百安全，請避免透過本平台傳送敏感個人資料。</p>

          <h2>六、資料來源聲明</h2>
          <p>本平台所呈現的房地產資料來源為：</p>
          <ul>
            <li>司法院法院拍賣公告（公開資料）</li>
            <li>內政部不動產交易實價登錄資料（政府開放資料）</li>
          </ul>
          <p>上述資料均為政府公開資料，依開放資料授權條款使用。本平台對資料的正確性不負擔保責任，投標前請至司法院官網確認最新資訊。</p>

          <h2>七、政策變更</h2>
          <p>本平台保留修改本隱私權政策的權利，修改後將公告於本頁面。建議定期查閱。</p>

          <h2>八、聯絡我們</h2>
          <p>如您對本隱私權政策有任何疑問，請透過電子郵件與我們聯繫：<a href="mailto:briskbreeze5@gmail.com">briskbreeze5@gmail.com</a></p>
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
