import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '找不到頁面 | 法拍屋資訊平台',
};

export default function NotFound() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: var(--font-noto-sans-tc), sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: var(--font-noto-serif-tc), serif; font-size: 1.05rem; font-weight: 700; color: #ad5620; text-decoration: none; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #767676; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #555; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; white-space: nowrap; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .container { max-width: 640px; margin: 0 auto; padding: clamp(3rem,8vw,6rem) clamp(1rem,3vw,2rem); text-align: center; }
        .code { font-size: clamp(4rem,15vw,7rem); font-weight: 800; color: #ead8ca; font-family: var(--font-noto-serif-tc), serif; line-height: 1; margin-bottom: 1rem; }
        .title { font-family: var(--font-noto-serif-tc), serif; font-size: clamp(1.3rem,4vw,1.8rem); font-weight: 700; color: #222; margin-bottom: .75rem; }
        .desc { font-size: .95rem; color: #666; line-height: 1.85; margin-bottom: 2.5rem; }
        .links { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center; }
        .btn-primary { display: inline-block; background: #ad5620; color: #fff; text-decoration: none; padding: .65rem 1.5rem; border-radius: 2px; font-size: .9rem; font-weight: 500; }
        .btn-primary:hover { background: #c2632a; }
        .btn-ghost { display: inline-block; background: #fff; color: #555; text-decoration: none; padding: .65rem 1.5rem; border-radius: 2px; font-size: .9rem; border: 1px solid #ddd; }
        .btn-ghost:hover { border-color: #bbb; color: #333; }
        .nav-grid { margin-top: 3rem; border-top: 1px solid #e8e4e0; padding-top: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .5rem; text-align: left; }
        .nav-item { display: block; padding: .7rem 1rem; background: #fff; border: 1px solid #ececec; border-radius: 2px; text-decoration: none; color: #444; font-size: .85rem; }
        .nav-item:hover { border-color: #f0c4a0; color: #ad5620; }
        .nav-item-icon { display: block; font-size: .7rem; color: #999; margin-bottom: .2rem; }
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

      <div className="container">
        <div className="code">404</div>
        <h1 className="title">找不到這個頁面</h1>
        <p className="desc">
          您要找的頁面可能已移除、改名，或暫時無法存取。<br />
          請確認網址是否正確，或從下方快速連結繼續瀏覽。
        </p>
        <div className="links">
          <Link href="/" className="btn-primary">回首頁</Link>
          <Link href="/auction" className="btn-ghost">瀏覽法拍屋</Link>
        </div>

        <nav className="nav-grid">
          <Link href="/auction" className="nav-item">
            <span className="nav-item-icon">法拍</span>
            法拍屋查詢
          </Link>
          <Link href="/price" className="nav-item">
            <span className="nav-item-icon">實價</span>
            實價登錄
          </Link>
          <Link href="/presale" className="nav-item">
            <span className="nav-item-icon">預售</span>
            預售屋行情
          </Link>
          <Link href="/community" className="nav-item">
            <span className="nav-item-icon">社區</span>
            社區大樓
          </Link>
          <Link href="/重劃區" className="nav-item">
            <span className="nav-item-icon">重劃</span>
            重劃區資訊
          </Link>
          <Link href="/special-properties/inherited-land" className="nav-item">
            <span className="nav-item-icon">繼承</span>
            繼承土地
          </Link>
        </nav>
      </div>
    </>
  );
}
