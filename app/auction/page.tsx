export const revalidate = 86400;
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';

const SIX_METROS   = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
const OTHER_CITIES = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; district?: string }>;
}): Promise<Metadata> {
  const { city = '台中市', district = '' } = await searchParams;
  const loc = district ? `${city}${district}` : city;
  return {
    title:       `${loc}法拍屋 | 最新開標資訊與底價查詢`,
    description: `查詢${loc}最新法拍屋開標資訊，包含底價、坪數、格局、點交情形，並對照實際成交行情。`,
    alternates:  { canonical: `/auction?city=${encodeURIComponent(city)}${district ? `&district=${encodeURIComponent(district)}` : ''}` },
  };
}

interface HomeProps {
  searchParams: Promise<{ city?: string; district?: string; page?: string; sort?: string; delivery?: string; priceMin?: string; priceMax?: string }>;
}

// ─── 輔助：格式化拍賣日期 ─────────────────────────────────────────────────────
function parseDate(raw: string | null): string {
  if (!raw) return '—';
  if (raw.length > 20) {
    const m = raw.match(/\d{2,4}[./\-]\d{1,2}[./\-]\d{1,2}/);
    return m ? m[0] : '—';
  }
  return raw;
}

// ─── 輔助：狀態標籤顏色 ───────────────────────────────────────────────────────
function statusStyle(status: string | null): React.CSSProperties {
  if (!status) return { background: '#f5f5f3', color: '#aaa', border: '1px solid #e8e8e4' };
  if (status.includes('待標') || status.includes('應買'))
    return { background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' };
  if (status.includes('拍定') || status.includes('成交'))
    return { background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' };
  return { background: '#f5f5f3', color: '#888', border: '1px solid #e8e8e4' };
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const city     = params.city     || '台中市';
  const district = params.district || '';
  const page     = parseInt(params.page || '1', 10);
  const sort     = params.sort || 'date';
  const delivery = params.delivery || '';        // '' | 'yes' | 'no'
  const priceMin = params.priceMin ? parseInt(params.priceMin, 10) : null;
  const priceMax = params.priceMax ? parseInt(params.priceMax, 10) : null;
  const pageSize = 30;

  let houses: any[]       = [];
  let featuredItems: any[] = [];
  let totalCount           = 0;
  let errorMsg             = '';
  let districts: string[]  = [];

  try {
    const safeCity     = city.replace(/'/g, "''");
    const safeDistrict = district.replace(/'/g, "''");

    const conds = [`city = '${safeCity}'`];
    if (district) conds.push(`district = '${safeDistrict}'`);
    if (delivery === 'yes') { conds.push(`delivery LIKE '%點交%'`); conds.push(`delivery NOT LIKE '%不點交%'`); }
    if (delivery === 'no')  conds.push(`delivery LIKE '%不點交%'`);
    if (priceMin !== null)  conds.push(`price >= ${priceMin * 10000}`);
    if (priceMax !== null)  conds.push(`price <= ${priceMax * 10000}`);
    const whereStr = conds.join(' AND ');

    // 精選物件排最前，再依使用者選擇的排序
    const orderByStr = sort === 'price'
      ? `CASE WHEN is_agent_featured=1 THEN 0 ELSE 1 END, CASE WHEN price IS NULL OR price = 0 THEN 1 ELSE 0 END, price ASC`
      : `CASE WHEN is_agent_featured=1 THEN 0 ELSE 1 END, CASE WHEN auction_date IS NULL OR auction_date = '' THEN 1 ELSE 0 END, auction_date DESC`;

    const [fetched, countRes, distRows, featuredRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM houses WHERE ${whereStr} ORDER BY ${orderByStr} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      ),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as count FROM houses WHERE ${whereStr}`),
      prisma.houses.findMany({ where: { city }, select: { district: true }, distinct: ['district'] }),
      // 精選區塊：固定抓該縣市所有代標精選，最多 6 筆，不受分頁/篩選影響
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM houses WHERE city='${safeCity}' AND is_agent_featured=1
         ORDER BY CASE WHEN auction_date IS NULL OR auction_date='' THEN 1 ELSE 0 END, auction_date ASC
         LIMIT 6`
      ),
    ]);

    houses        = fetched;
    totalCount    = Number(countRes[0].count);
    featuredItems = featuredRows || [];
    districts     = distRows.map((d: { district: string | null }) => d.district).filter(Boolean).sort() as string[];
  } catch (e: any) {
    console.error('DB error:', e);
    errorMsg = '目前無法載入資料，請確認資料庫連線。';
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const sixMetros  = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'];
  const otherCities = ['基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
  const cities = [...sixMetros, ...otherCities];
  const isOtherCity = !sixMetros.includes(city);

  // ── buildHref 工具 ──────────────────────────────────────────────────────────
  const q = (overrides: Record<string, string | number | undefined>) => {
    const base = { city, district, sort, page, delivery, priceMin: priceMin ?? undefined, priceMax: priceMax ?? undefined } as Record<string, string | number | undefined>;
    const merged = { ...base, ...overrides };
    const pairs = Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined);
    return '/auction?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }

        /* ── 頂部 site bar ── */
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1.5rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; font-family: 'Noto Sans TC', sans-serif; }

        /* 縣市切換 tabs */
        .city-tabs { display: flex; gap: 0; flex-shrink: 0; border: 1px solid #ececec; border-radius: 2px; overflow: hidden; }
        .city-tab { padding: .3rem .9rem; font-size: .8rem; font-weight: 400; color: #888; text-decoration: none; background: #fff; border-right: 1px solid #ececec; transition: all .15s; white-space: nowrap; }
        .city-tab:last-child { border-right: none; }
        .city-tab:hover { color: #c2632a; background: #fff8f4; }
        .city-tab.active { background: #c2632a; color: #fff; font-weight: 500; }

        /* 漢堡下拉（純 CSS details） */
        .city-more { position: relative; flex-shrink: 0; }
        .city-more summary { list-style: none; padding: .3rem .9rem; font-size: .8rem; color: #888; background: #fff; border: 1px solid #ececec; border-radius: 2px; cursor: pointer; white-space: nowrap; transition: all .15s; user-select: none; }
        .city-more summary::-webkit-details-marker { display: none; }
        .city-more[open] summary { color: #c2632a; background: #fff8f4; border-color: #f0c4a0; }
        .city-more summary::after { content: ' ▾'; font-size: .65rem; }
        .city-more[open] summary::after { content: ' ▴'; }
        .city-dropdown { position: absolute; top: calc(100% + 4px); left: 0; background: #fff; border: 1px solid #ececec; box-shadow: 0 4px 16px rgba(0,0,0,.08); z-index: 200; min-width: 160px; display: grid; grid-template-columns: 1fr 1fr; }
        .city-dropdown a { display: block; padding: .42rem .85rem; font-size: .8rem; color: #666; text-decoration: none; border-bottom: 1px solid #f5f5f5; transition: all .12s; white-space: nowrap; }
        .city-dropdown a:hover { color: #c2632a; background: #fff8f4; }
        .city-dropdown a.active { color: #c2632a; font-weight: 500; background: #fff3ee; }

        /* 篩選 radio / checkbox 選項 */
        .filter-option { display: flex; align-items: center; gap: 8px; padding: .45rem 1rem; font-size: .82rem; color: #666; text-decoration: none; border-left: 3px solid transparent; transition: all .12s; cursor: pointer; }
        .filter-option:hover { color: #c2632a; background: #fffaf8; border-left-color: #f0c4a0; }
        .filter-option.active { color: #c2632a; font-weight: 500; background: #fff3ee; border-left-color: #c2632a; }
        .filter-dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #ddd; flex-shrink: 0; transition: all .12s; }
        .filter-option.active .filter-dot { border-color: #c2632a; background: #c2632a; }

        /* 價格區間輸入 */
        .price-range { padding: .6rem 1rem .85rem; display: flex; flex-direction: column; gap: 6px; }
        .price-range-row { display: flex; align-items: center; gap: 6px; }
        .price-input { flex: 1; min-width: 0; padding: .3rem .5rem; font-size: .8rem; border: 1px solid #e8e8e4; border-radius: 1px; outline: none; font-family: 'Noto Sans TC', sans-serif; color: #444; background: #fafafa; }
        .price-input:focus { border-color: #f0c4a0; background: #fffaf8; }
        .price-sep { font-size: .75rem; color: #ccc; flex-shrink: 0; }
        .price-submit { display: block; width: 100%; padding: .38rem 0; font-size: .78rem; font-weight: 500; text-align: center; background: #c2632a; color: #fff; border: none; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; letter-spacing: .06em; transition: background .15s; margin-top: 2px; }
        .price-submit:hover { background: #a04d1e; }
        .price-clear { display: block; text-align: center; font-size: .75rem; color: #bbb; text-decoration: none; margin-top: 4px; }
        .price-clear:hover { color: #c2632a; }

        /* 排序 */
        .sort-tabs { margin-left: auto; display: flex; gap: 0; border: 1px solid #ececec; border-radius: 2px; overflow: hidden; flex-shrink: 0; }
        .sort-tab { padding: .3rem .85rem; font-size: .78rem; font-weight: 400; color: #888; text-decoration: none; background: #fff; border-right: 1px solid #ececec; transition: all .15s; white-space: nowrap; }
        .sort-tab:last-child { border-right: none; }
        .sort-tab:hover { color: #c2632a; }
        .sort-tab.active { background: #fff8f4; color: #c2632a; font-weight: 500; }

        /* ── 主體 layout ── */
        .layout { max-width: 1200px; margin: 0 auto; padding: clamp(1rem,3vw,1.75rem) clamp(1rem,3vw,2rem); display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; align-items: start; }

        /* ── 左側篩選欄 ── */
        .sidebar { background: #fff; border: 1px solid #ececec; position: sticky; top: 64px; }
        .sidebar-section { border-bottom: 1px solid #f0f0f0; }
        .sidebar-section:last-child { border-bottom: none; }
        .sidebar-head { padding: .65rem 1rem; font-size: 9.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: #c2632a; background: #fff8f4; border-left: 3px solid #c2632a; }
        .sidebar-link { display: block; padding: .5rem 1rem; font-size: .82rem; color: #666; text-decoration: none; border-left: 3px solid transparent; transition: all .12s; }
        .sidebar-link:hover { color: #c2632a; background: #fffaf8; border-left-color: #f0c4a0; }
        .sidebar-link.active { color: #c2632a; font-weight: 500; background: #fff3ee; border-left-color: #c2632a; }
        .sidebar-link .count { float: right; font-size: 10px; color: #ccc; font-weight: 300; }

        /* ── 右側主區 ── */
        .main-area { min-width: 0; }

        /* 結果 header bar */
        .result-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 1rem; padding-bottom: .85rem; border-bottom: 1px solid #ececec; }
        .result-title { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 500; color: #c2632a; }
        .result-count { font-size: .82rem; color: #aaa; font-weight: 300; }
        .result-page  { font-size: .78rem; color: #ccc; font-weight: 300; margin-left: auto; }

        /* 物件卡片列表 */
        .card-list { display: flex; flex-direction: column; gap: 1px; }

        /* 單張卡 — 591 橫排風格 */
        .house-card { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 120px 1fr auto; align-items: stretch; transition: box-shadow .18s; text-decoration: none; color: inherit; }
        .house-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.07); z-index: 1; position: relative; }
        .house-card:hover .card-title { color: #c2632a; }

        /* 縮圖區 */
        .card-thumb { background: #f5f5f3; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; opacity: .25; width: 120px; flex-shrink: 0; }

        /* 內容區 */
        .card-body { padding: .85rem 1rem; min-width: 0; display: flex; flex-direction: column; gap: .35rem; }
        .card-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: .15rem; }
        .card-badge { font-size: 10px; font-weight: 500; letter-spacing: .06em; padding: .18rem .55rem; border-radius: 1px; }
        .card-title { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 500; color: #333; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: color .15s; }
        .card-meta { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; }
        .card-meta-item { font-size: .78rem; color: #999; font-weight: 300; }
        .card-meta-item strong { color: #555; font-weight: 400; }
        .card-date { font-size: .78rem; color: #bbb; font-weight: 300; margin-top: auto; }

        /* 右側價格區 */
        .card-price-col { padding: .85rem 1.1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; border-left: 1px solid #f5f5f5; min-width: 110px; flex-shrink: 0; }
        .card-price-label { font-size: 9.5px; color: #ccc; letter-spacing: .08em; }
        .card-price { font-family: 'Noto Serif TC', serif; font-size: 1.4rem; font-weight: 600; color: #c2632a; line-height: 1.2; }
        .card-price small { font-size: .7rem; font-weight: 400; color: #c2632a; margin-left: 2px; }
        .card-unit { font-size: .78rem; color: #aaa; font-weight: 300; }
        .card-arrow { font-size: .75rem; color: #ccc; margin-top: auto; transition: color .15s; }
        .house-card:hover .card-arrow { color: #c2632a; }

        /* 代標精選 badge */
        .badge-featured { background: linear-gradient(90deg,#c2632a,#e07340); color:#fff !important; border:none !important; font-weight:600; letter-spacing:.06em; }
        /* 已結標 badge */
        .badge-expired { background: #f0f0ee !important; color: #aaa !important; border-color: #e0e0dc !important; }
        /* 已結標卡片：灰階弱化 */
        .house-card.expired { opacity: .58; filter: grayscale(30%); }
        .house-card.expired .card-title { color: #999; }
        .house-card.expired .card-price { color: #bbb !important; }
        .house-card.expired .card-price small { color: #bbb !important; }
        .house-card.expired:hover { opacity: .75; filter: grayscale(15%); }

        /* 代標精選區塊 */
        .featured-section { border:1px solid #f0c4a0; border-left:4px solid #c2632a; background:#fff8f4; padding:1rem 1.25rem 1.25rem; margin-bottom:1.25rem; }
        .featured-head { display:flex; align-items:center; gap:.5rem; margin-bottom:.85rem; }
        .featured-title { font-family:'Noto Serif TC',serif; font-size:.9rem; font-weight:700; color:#c2632a; }
        .featured-sub { font-size:.72rem; color:#b07340; font-weight:300; }
        .featured-card { background:#fff; border:1px solid #f0c4a0; display:grid; grid-template-columns:1fr auto; align-items:stretch; transition:box-shadow .18s; text-decoration:none; color:inherit; margin-bottom:1px; }
        .featured-card:hover { box-shadow:0 2px 12px rgba(194,99,42,.12); }
        .featured-card:hover .card-title { color:#c2632a; }
        .featured-card .card-price-col { border-left:1px solid #f0c4a0; }

        /* 空結果 */
        .empty-state { padding: 4rem 2rem; text-align: center; background: #fff; border: 1px solid #ececec; }

        /* 分頁 */
        .pagination { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 1.5rem; }
        .page-btn { display: inline-block; padding: .45rem .9rem; font-size: .82rem; color: #888; background: #fff; border: 1px solid #e8e8e4; text-decoration: none; transition: all .15s; font-family: 'Noto Sans TC', sans-serif; }
        .page-btn:hover { border-color: #c2632a; color: #c2632a; }
        .page-btn.active { background: #c2632a; color: #fff; border-color: #c2632a; }
        .page-btn.disabled { color: #ddd; border-color: #f0f0f0; pointer-events: none; }
        .page-ellipsis { color: #ccc; font-size: .82rem; padding: 0 4px; }

        /* 麵包屑 hero */
        .hero { background: #fff; border-bottom: 1px solid #ececec; padding: 1.1rem clamp(1rem,3vw,2rem); }
        .hero-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
        .hero-h1 { font-family: 'Noto Serif TC', serif; font-size: 1.3rem; font-weight: 500; color: #c2632a; }
        .hero-sub { font-size: .82rem; color: #aaa; font-weight: 300; }
        .hero-stat { font-size: .82rem; color: #c2632a; font-weight: 400; margin-left: auto; }

        @media (max-width: 768px) {
          .layout { grid-template-columns: 1fr; }
          .sidebar { position: static; display: flex; flex-wrap: wrap; }
          .sidebar-section { flex: 1 1 50%; }
          .house-card { grid-template-columns: 80px 1fr; }
          .card-price-col { display: none; }
          .city-tabs, .sort-tabs { display: none; }
        }
      `}</style>

      {/* ━━━━━━━━━━━━━━━ 頂部 Site Bar ━━━━━━━━━━━━━━━ */}
      <header className="site-bar">
        <div className="site-bar-inner">

          {/* Logo */}
          <a href="/" className="site-logo">
            法拍屋<span>資訊平台</span>
          </a>

          {/* 實價登錄入口 */}
          <a href="/lvr"
            style={{ fontSize: '.8rem', fontWeight: 500, color: '#2a5298', textDecoration: 'none',
              padding: '.28rem .75rem', border: '1px solid #2a5298', borderRadius: '2px',
              background: '#f0f5ff', whiteSpace: 'nowrap', transition: 'all .15s', flexShrink: 0 }}>
            實價登錄
          </a>
          <a href="/compare"
            style={{ fontSize: '.8rem', fontWeight: 500, color: '#6b8cc7', textDecoration: 'none',
              padding: '.28rem .75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
            比較
          </a>

          {/* 六都切換 */}
          <nav className="city-tabs">
            {sixMetros.map(c => (
              <a key={c} href={q({ city: c, district: '', page: 1, delivery: '', priceMin: undefined, priceMax: undefined })}
                className={`city-tab${city === c ? ' active' : ''}`}>
                {c}
              </a>
            ))}
          </nav>

          {/* 其他縣市 — 漢堡下拉 */}
          <details className="city-more">
            <summary>{isOtherCity ? city : '其他縣市'}</summary>
            <div className="city-dropdown">
              {otherCities.map(c => (
                <a key={c} href={q({ city: c, district: '', page: 1, delivery: '', priceMin: undefined, priceMax: undefined })}
                  className={city === c ? 'active' : ''}>
                  {c}
                </a>
              ))}
            </div>
          </details>

          {/* 排序 */}
          <nav className="sort-tabs">
            <a href={q({ sort: 'date', page: 1 })}
              className={`sort-tab${sort === 'date' ? ' active' : ''}`}>
              依開標日 新→舊
            </a>
            <a href={q({ sort: 'price', page: 1 })}
              className={`sort-tab${sort === 'price' ? ' active' : ''}`}>
              依底價 ↑
            </a>
          </nav>

        </div>
      </header>

      {/* ━━━━━━━━━━━━━━━ Hero 標題列 ━━━━━━━━━━━━━━━ */}
      <div className="hero">
        <div className="hero-inner">
          <h1 className="hero-h1">
            {city}{district && ` › ${district}`} 法拍屋
          </h1>
          <span className="hero-sub">
            {district ? `${district} 行政區` : '全區域'} 法院拍賣物件列表
          </span>
          <span className="hero-stat">
            共 {totalCount.toLocaleString()} 筆 · 第 {page}/{totalPages || 1} 頁
          </span>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━ 主體：左側篩選 + 右側列表 ━━━━━━━━━━━━━━━ */}
      <div className="layout">

        {/* ── 左側篩選欄 ── */}
        <aside className="sidebar">

          {/* 行政區 */}
          <div className="sidebar-section">
            <div className="sidebar-head">行政區</div>
            <a href={q({ district: '', page: 1 })}
              className={`sidebar-link${!district ? ' active' : ''}`}>
              全部區域
            </a>
            {districts.map(d => (
              <a key={d} href={q({ district: d, page: 1 })}
                className={`sidebar-link${district === d ? ' active' : ''}`}>
                {d}
              </a>
            ))}
          </div>

          {/* 點交篩選 */}
          <div className="sidebar-section">
            <div className="sidebar-head">點交情形</div>
            <a href={q({ delivery: '', page: 1 })} className={`filter-option${!delivery ? ' active' : ''}`}>
              <span className="filter-dot" />全部
            </a>
            <a href={q({ delivery: 'yes', page: 1 })} className={`filter-option${delivery === 'yes' ? ' active' : ''}`}>
              <span className="filter-dot" />可點交
            </a>
            <a href={q({ delivery: 'no', page: 1 })} className={`filter-option${delivery === 'no' ? ' active' : ''}`}>
              <span className="filter-dot" />不點交
            </a>
          </div>

          {/* 價格區間 */}
          <div className="sidebar-section">
            <div className="sidebar-head">底價區間（萬）</div>
            {/* 快速選項 */}
            {[
              { label: '不限',        min: '',    max: ''    },
              { label: '500 萬以下',  min: '',    max: '500' },
              { label: '500–1,000 萬',min: '500', max: '1000'},
              { label: '1,000–2,000', min: '1000',max: '2000'},
              { label: '2,000 萬以上',min: '2000',max: ''    },
            ].map(opt => {
              const isActive =
                (priceMin === null ? '' : String(priceMin)) === opt.min &&
                (priceMax === null ? '' : String(priceMax)) === opt.max;
              return (
                <a key={opt.label}
                  href={q({ priceMin: opt.min || undefined, priceMax: opt.max || undefined, page: 1 })}
                  className={`filter-option${isActive ? ' active' : ''}`}>
                  <span className="filter-dot" />{opt.label}
                </a>
              );
            })}
            {/* 自訂輸入 */}
            <form className="price-range" action="/auction" method="get">
              <input type="hidden" name="city"     value={city} />
              <input type="hidden" name="district" value={district} />
              <input type="hidden" name="sort"     value={sort} />
              {delivery && <input type="hidden" name="delivery" value={delivery} />}
              <div className="price-range-row">
                <input className="price-input" type="number" name="priceMin"
                  placeholder="最低" defaultValue={priceMin ?? ''} min={0} />
                <span className="price-sep">–</span>
                <input className="price-input" type="number" name="priceMax"
                  placeholder="最高" defaultValue={priceMax ?? ''} min={0} />
              </div>
              <button type="submit" className="price-submit">套用</button>
              {(priceMin !== null || priceMax !== null) && (
                <a href={q({ priceMin: undefined, priceMax: undefined, page: 1 })} className="price-clear">清除區間</a>
              )}
            </form>
          </div>

          {/* 排序（行動版補充） */}
          <div className="sidebar-section">
            <div className="sidebar-head">排序方式</div>
            <a href={q({ sort: 'date', page: 1 })}
              className={`sidebar-link${sort === 'date' ? ' active' : ''}`}>
              依開標日期
            </a>
            <a href={q({ sort: 'price', page: 1 })}
              className={`sidebar-link${sort === 'price' ? ' active' : ''}`}>
              依拍賣底價
            </a>
          </div>

          {/* 縣市（行動版補充） */}
          <div className="sidebar-section">
            <div className="sidebar-head">縣市切換</div>
            {cities.map(c => (
              <a key={c} href={q({ city: c, district: '', page: 1 })}
                className={`sidebar-link${city === c ? ' active' : ''}`}>
                {c}
              </a>
            ))}
          </div>

        </aside>

        {/* ── 右側主區 ── */}
        <main className="main-area">

          {/* 結果 header */}
          <div className="result-bar">
            <span className="result-title">
              {city}{district && ` ${district}`} 法拍物件
            </span>
            <span className="result-count">
              共 {totalCount.toLocaleString()} 筆
            </span>
            <span className="result-page">
              第 {page} / {totalPages || 1} 頁
            </span>
          </div>

          {/* 錯誤訊息 */}
          {errorMsg && (
            <div style={{ background: '#fff4f4', border: '1px solid #f0b0b0', borderLeft: '4px solid #b03a3a', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '.875rem', color: '#b03a3a', margin: 0, fontWeight: 400 }}>{errorMsg}</p>
            </div>
          )}

          {/* ── 代標精選區塊（B） ── */}
          {featuredItems.length > 0 && page === 1 && (
            <div className="featured-section">
              <div className="featured-head">
                <span className="featured-title">★ 代標精選推薦</span>
                <span className="featured-sub">代標業者肉眼精選・高詢問度物件・{featuredItems.length} 筆</span>
              </div>
              <div className="card-list">
                {featuredItems.map((house: any) => {
                  const href = `/auction/${encodeURIComponent(house.city || '未知縣市')}/${encodeURIComponent(house.district || '未知區域')}/${house.id}`;
                  const priceWan = house.price ? Math.floor(Number(house.price) / 10000) : null;
                  const badgeS = statusStyle(house.status);
                  return (
                    <a key={house.id} href={href} className="featured-card">
                      <div className="card-body">
                        <div className="card-badges">
                          <span className="card-badge badge-featured">★ 代標精選</span>
                          {house.type && <span className="card-badge" style={{ background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' }}>{house.type}</span>}
                          {house.status && <span className="card-badge" style={badgeS}>{house.status}</span>}
                          {house.delivery && <span className="card-badge" style={{ background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' }}>✓ {house.delivery}</span>}
                          {house.auction_round && <span className="card-badge" style={{ background: '#fafafa', color: '#aaa', border: '1px solid #e8e8e4' }}>{house.auction_round}</span>}
                        </div>
                        <div className="card-title">{house.title || house.address || '（無標題）'}</div>
                        <div className="card-meta">
                          {house.address && <span className="card-meta-item">📍 {house.district} {house.address.replace(house.city||'','').replace(house.district||'','').trim()}</span>}
                          {house.area ? <span className="card-meta-item"><strong>{house.area}</strong> 坪</span> : null}
                          {house.floor && <span className="card-meta-item">{house.floor}</span>}
                        </div>
                        <div className="card-date">📅 開標 {parseDate(house.auction_date)}</div>
                      </div>
                      <div className="card-price-col">
                        <div>
                          <div className="card-price-label">拍賣底價</div>
                          <div className="card-price">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                          {house.unit_price ? <div className="card-unit">{house.unit_price} 萬/坪</div> : null}
                        </div>
                        <div className="card-arrow">詳情 →</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* 物件卡片列表 */}
          <div className="card-list">
            {houses.length > 0 ? houses.map(house => {
              const href = `/auction/${encodeURIComponent(house.city || '未知縣市')}/${encodeURIComponent(house.district || '未知區域')}/${house.id}`;
              const priceWan = house.price ? Math.floor(Number(house.price) / 10000) : null;
              const badgeS = statusStyle(house.status);
              const today = new Date().toISOString().slice(0, 10);
              const isExpired = !!house.auction_date && house.auction_date < today;
              const soldMatch = typeof house.status === 'string' ? house.status.match(/^拍定([\d.,]+萬?)/) : null;
              const soldPrice = soldMatch ? soldMatch[1] : null;

              return (
                <a key={house.id} href={href} className={`house-card${isExpired ? ' expired' : ''}`}>

                  {/* 縮圖（暫無圖） */}
                  <div className="card-thumb">🏠</div>

                  {/* 內容 */}
                  <div className="card-body">
                    {/* Badges */}
                    <div className="card-badges">
                      {isExpired && (
                        <span className="card-badge badge-expired">已結標</span>
                      )}
                      {house.is_agent_featured == 1 && (
                        <span className="card-badge badge-featured">★ 代標精選</span>
                      )}
                      {house.type && (
                        <span className="card-badge" style={{ background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' }}>
                          {house.type}
                        </span>
                      )}
                      {!isExpired && house.status && (
                        <span className="card-badge" style={badgeS}>
                          {house.status}
                        </span>
                      )}
                      {house.delivery && (
                        <span className="card-badge" style={{ background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' }}>
                          ✓ {house.delivery}
                        </span>
                      )}
                      {house.auction_round && (
                        <span className="card-badge" style={{ background: '#fafafa', color: '#aaa', border: '1px solid #e8e8e4' }}>
                          {house.auction_round}
                        </span>
                      )}
                    </div>

                    {/* 標題 */}
                    <div className="card-title">
                      {house.title || house.address || '（無標題）'}
                    </div>

                    {/* 地址 / 坪數 / 格局 */}
                    <div className="card-meta">
                      {house.address && (
                        <span className="card-meta-item">
                          📍 {house.district} {house.address.replace(house.city || '', '').replace(house.district || '', '').trim()}
                        </span>
                      )}
                      {house.area ? (
                        <span className="card-meta-item">
                          <strong>{house.area}</strong> 坪
                        </span>
                      ) : null}
                      {house.layout && (
                        <span className="card-meta-item">
                          {house.layout}
                        </span>
                      )}
                      {house.floor && (
                        <span className="card-meta-item">
                          {house.floor}
                        </span>
                      )}
                    </div>

                    {/* 開標日 */}
                    <div className="card-date">
                      📅 開標 {parseDate(house.auction_date)}
                    </div>
                  </div>

                  {/* 右側價格 */}
                  <div className="card-price-col">
                    <div>
                      <div className="card-price-label">
                        {soldPrice ? '拍定成交' : isExpired ? '底價（已結標）' : '拍賣底價'}
                      </div>
                      <div className="card-price">
                        {soldPrice
                          ? <>{soldPrice}</>
                          : priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}
                      </div>
                      {!soldPrice && house.unit_price ? (
                        <div className="card-unit">{house.unit_price} 萬/坪</div>
                      ) : null}
                    </div>
                    <div className="card-arrow">詳情 →</div>
                  </div>

                </a>
              );
            }) : (
              <div className="empty-state">
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: .3 }}>🔍</div>
                <p style={{ fontSize: '.95rem', color: '#888', fontWeight: 400, marginBottom: '.5rem' }}>
                  此區域目前無公開資料
                </p>
                <p style={{ fontSize: '.82rem', color: '#ccc', fontWeight: 300 }}>
                  請嘗試切換行政區，或點擊「全部區域」
                </p>
              </div>
            )}
          </div>

          {/* ── 分頁 ── */}
          {totalPages > 1 && (() => {
            // 顯示頁碼範圍：當前頁前後各 2 頁
            const pageNums: (number | '…')[] = [];
            for (let i = 1; i <= totalPages; i++) {
              if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
                pageNums.push(i);
              } else if (pageNums[pageNums.length - 1] !== '…') {
                pageNums.push('…');
              }
            }

            return (
              <div className="pagination">
                {/* 上一頁 */}
                {page > 1
                  ? <a href={q({ page: page - 1 })} className="page-btn">← 上一頁</a>
                  : <span className="page-btn disabled">← 上一頁</span>
                }

                {pageNums.map((n, i) =>
                  n === '…'
                    ? <span key={`e${i}`} className="page-ellipsis">…</span>
                    : <a key={n} href={q({ page: n })}
                        className={`page-btn${n === page ? ' active' : ''}`}>
                        {n}
                      </a>
                )}

                {/* 下一頁 */}
                {page < totalPages
                  ? <a href={q({ page: page + 1 })} className="page-btn">下一頁 →</a>
                  : <span className="page-btn disabled">下一頁 →</span>
                }
              </div>
            );
          })()}

        </main>
      </div>
    </>
  );
}