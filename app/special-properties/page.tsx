export const revalidate = 86400;
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '特殊物件 | 繼承土地、區段徵收、金拍、銀拍、國產署',
  description: '逾期未辦繼承登記土地、區段徵收開發案、金融機構拍賣、國產署標售等非一般管道房地產資訊，取得方式與代辦諮詢。',
  alternates: { canonical: '/special-properties' },
};

const TYPES = [
  {
    slug:  'inherited-land',
    title: '逾期未辦繼承登記土地',
    icon:  '🏚️',
    desc:  '地籍科每年公告逾期未辦繼承之土地，公告期滿後可申請法院代為標售，是法拍前期重要案源信號。',
    live:  true,
    hot:   true,
    color: '#c2632a',
    bg:    '#fff8f4',
    border:'#f0c4a0',
    cta:   '查看各地公告 →',
  },
  {
    slug:  'rezoning',
    title: '區段徵收開發案',
    icon:  '🏗️',
    desc:  '各縣市政府辦理區段徵收開發案資訊，被徵收土地所有人可查詢補償費、抵價地分配與申請程序。',
    live:  true,
    hot:   false,
    color: '#b85c00',
    bg:    '#fff8f0',
    border:'#f0c080',
    cta:   '查看開發案清單 →',
  },
  {
    slug:  'gold-auction',
    title: '金拍屋（台灣金服）',
    icon:  '🏦',
    desc:  '台灣金融資產服務公司標售之金融機構不良資產，流程透明，可網路競標。',
    live:  false,
    hot:   false,
    color: '#2a5298',
    bg:    '#f0f5ff',
    border:'#b8d0f0',
    cta:   '',
  },
  {
    slug:  'bank-auction',
    title: '銀拍屋（各銀行自辦）',
    icon:  '🏛️',
    desc:  '各銀行自行處分之擔保品，散佈各銀行官網，需逐一追蹤，通常比法院底價更低。',
    live:  false,
    hot:   false,
    color: '#2a5298',
    bg:    '#f0f5ff',
    border:'#b8d0f0',
    cta:   '',
  },
  {
    slug:  'national-property',
    title: '國產署（財政部）',
    icon:  '🏛️',
    desc:  '財政部國有財產署標售、讓售與招租之國有不動產，含素地與建物，部分低於市價。',
    live:  false,
    hot:   false,
    color: '#2a5298',
    bg:    '#f0f5ff',
    border:'#b8d0f0',
    cta:   '',
  },
];

export default function SpecialPropertiesPage() {
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
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap: 1rem; }
        .type-card { display: block; text-decoration: none; padding: 1.5rem; border: 1px solid; border-radius: 2px; transition: box-shadow .15s; }
        .type-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1); transform: translateY(-1px); }
        .type-icon { font-size: 2rem; margin-bottom: .6rem; }
        .type-title { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; margin-bottom: .5rem; }
        .type-desc { font-size: .78rem; color: #666; line-height: 1.8; }
        .hot-badge { display: inline-block; font-size: .62rem; background: #fff3ee; color: #c2632a; border: 1px solid #f0c4a0; padding: .1rem .4rem; border-radius: 2px; margin-left: .5rem; vertical-align: middle; }
        .type-cta { font-size: .75rem; font-weight: 500; margin-top: .75rem; }
        .coming-soon { font-size: .68rem; color: #bbb; margin-top: .5rem; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/special-properties" className="nav-link" style={{ color: '#c2632a' }}>特殊物件</a>
          <a href="/auction"            className="nav-link">法拍屋</a>
          <a href="/price"              className="nav-link">實價登錄</a>
          <a href="/presale"            className="nav-link">預售屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #c2632a', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.4rem' }}>SPECIAL PROPERTIES · 特殊物件</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            特殊取得管道房地產資訊
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            非一般買賣管道的房地產取得方式，通常有較高折讓空間，但需要專業知識或代書協助。
          </p>
        </div>
      </div>

      <div className="wrap">
        <div className="card-grid">
          {TYPES.map(t => (
            <a key={t.slug}
              href={t.live ? `/special-properties/${t.slug}` : '#'}
              className="type-card"
              style={{ background: t.bg, borderColor: t.border }}>
              <div className="type-icon">{t.icon}</div>
              <div className="type-title" style={{ color: t.color }}>
                {t.title}
                {t.hot && <span className="hot-badge">熱門</span>}
              </div>
              <div className="type-desc">{t.desc}</div>
              {t.live
                ? <div className="type-cta" style={{ color: t.color }}>{t.cta}</div>
                : <div className="coming-soon">資料整合中，敬請期待</div>
              }
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
