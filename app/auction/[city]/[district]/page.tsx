export const revalidate = 86400;
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

type Params  = Promise<{ city: string; district: string }>;
type SearchP = Promise<{
  page?: string; sort?: string; delivery?: string;
  priceMin?: string; priceMax?: string; typeFilter?: string;
}>;

const PAGE_SIZE = 30;

const TAICHUNG_DISTRICT_PERIODS: Record<string, string[]> = {
  '東區':   ['1期', '6期', '9期'],
  '西區':   ['2期', '3期', '5期'],
  '北區':   ['4期'],
  '北屯區': ['4期', '10期', '11期', '14期'],
  '西屯區': ['4期', '5期', '7期', '12期'],
  '南屯區': ['5期', '7期', '8期', '13期'],
  '南區':   ['13期'],
  '大里區': ['15期'],
  '豐原區': ['16期'],
};

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const safeC0 = c.replace(/'/g, "''");
  const safeD0 = d.replace(/'/g, "''");
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as n, AVG(price) as avg FROM houses WHERE city='${safeC0}' AND district='${safeD0}' AND price>0`
  );
  const n   = Number(rows[0]?.n || 0);
  const avg = rows[0]?.avg ? Math.floor(Number(rows[0].avg) / 10000) : null;
  return {
    title:      `${c}${d}法拍屋 - 最新 ${n} 筆開標資訊、底價查詢`,
    description:`${c}${d}法拍屋共 ${n} 筆，${avg ? `均價約 ${avg} 萬，` : ''}涵蓋電梯大樓、公寓、透天、農地等類型。查看最新開標日期與底價，掌握投標先機。`,
    alternates: { canonical: `/auction/${city}/${district}` },
  };
}

const KNOWN_TYPES = ['透天/別墅', '電梯大樓', '透天店面', '公寓', '套房', '土地', '農舍', '店面', '車位'];

function cleanType(raw: string | null): string {
  if (!raw) return '';
  for (const t of KNOWN_TYPES) { if (raw.includes(t)) return t; }
  return raw.length <= 6 ? raw : '';
}

function cleanFloor(raw: string | null): string {
  if (!raw) return '';
  const m = raw.match(/^[\d\-~+]+樓(?:\/共\d+樓)?/);
  return m ? m[0] : raw.slice(0, 15);
}

function statusStyle(status: string | null): React.CSSProperties {
  if (!status) return { background: '#f5f5f3', color: '#aaa', border: '1px solid #e8e8e4' };
  if (status.includes('待標') || status.includes('應買'))
    return { background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' };
  if (status.includes('拍定') || status.includes('成交'))
    return { background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' };
  return { background: '#f5f5f3', color: '#888', border: '1px solid #e8e8e4' };
}

export default async function DistrictPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchP;
}) {
  const { city, district } = await params;
  const sp = await searchParams;

  const page       = Math.max(1, parseInt(sp.page || '1', 10));
  const sort       = sp.sort === 'price' ? 'price' : 'date';
  const delivery   = sp.delivery === 'yes' ? 'yes' : sp.delivery === 'no' ? 'no' : '';
  const priceMin   = sp.priceMin && /^\d+$/.test(sp.priceMin) ? parseInt(sp.priceMin, 10) : null;
  const priceMax   = sp.priceMax && /^\d+$/.test(sp.priceMax) ? parseInt(sp.priceMax, 10) : null;
  const typeFilter = KNOWN_TYPES.includes(sp.typeFilter || '') ? (sp.typeFilter || '') : '';

  const c     = decodeURIComponent(city);
  const d     = decodeURIComponent(district);
  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  const conds = [`city='${safeC}'`, `district='${safeD}'`];
  if (delivery === 'yes') { conds.push(`delivery LIKE '%點交%'`); conds.push(`delivery NOT LIKE '%不點交%'`); }
  if (delivery === 'no')  conds.push(`delivery LIKE '%不點交%'`);
  if (priceMin !== null)  conds.push(`price >= ${priceMin * 10000}`);
  if (priceMax !== null)  conds.push(`price <= ${priceMax * 10000}`);
  if (typeFilter)         conds.push(`type LIKE '%${typeFilter}%'`);
  const whereStr  = conds.join(' AND ');
  const baseWhere = `city='${safeC}' AND district='${safeD}'`;

  const orderByStr = sort === 'price'
    ? `CASE WHEN is_agent_featured=1 THEN 0 ELSE 1 END, CASE WHEN price IS NULL OR price=0 THEN 1 ELSE 0 END, price ASC`
    : `CASE WHEN is_agent_featured=1 THEN 0 ELSE 1 END, CASE WHEN auction_date IS NULL OR auction_date='' THEN 1 ELSE 0 END, auction_date DESC`;

  const [statsRows, listings, otherDistricts, countRow, typeRows, lvrRow, roadRows, roundRows, inheritedRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS n,
              AVG(CASE WHEN price>0 THEN price END) AS avg,
              MIN(CASE WHEN price>0 THEN price END) AS lo,
              MAX(CASE WHEN price>0 THEN price END) AS hi,
              MAX(CASE WHEN auction_date!='' THEN auction_date END) AS latest
       FROM houses WHERE ${baseWhere}`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, title, address, price, area, unit_price, auction_date, type, category,
              auction_round, delivery, status, layout, floor, is_agent_featured
       FROM houses WHERE ${whereStr}
       ORDER BY ${orderByStr}
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT district, COUNT(*) as n FROM houses
       WHERE city='${safeC}' AND district!='${safeD}'
         AND district IS NOT NULL AND district!=''
       GROUP BY district ORDER BY n DESC`
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n FROM houses WHERE ${whereStr}`
    ),
    prisma.$queryRawUnsafe<{ type: string; n: number }[]>(
      `SELECT type, COUNT(*) as n FROM houses
       WHERE city='${safeC}' AND district='${safeD}'
         AND type IS NOT NULL AND type!=''
       GROUP BY type ORDER BY n DESC`
    ),
    // 同行政區實價登錄均價（近兩年建物）
    prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
       FROM lvr_land
       WHERE city='${safeC}' AND district='${safeD}'
         AND tx_type LIKE '%建物%'
         AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')`
    ).catch(() => []),
    // 熱門法拍路段（取地址路/街名稱，≥2筆）
    prisma.$queryRawUnsafe<{ road: string; n: number; avg: number }[]>(
      `SELECT
         CASE
           WHEN STRPOS(address,'路')>0 AND (STRPOS(address,'街')=0 OR STRPOS(address,'路')<=STRPOS(address,'街'))
             THEN SUBSTRING(address,1,STRPOS(address,'路'))
           WHEN STRPOS(address,'街')>0
             THEN SUBSTRING(address,1,STRPOS(address,'街'))
           ELSE NULL
         END as road,
         COUNT(*) as n,
         AVG(CASE WHEN price>0 THEN price END) as avg
       FROM houses
       WHERE city='${safeC}' AND district='${safeD}'
         AND address IS NOT NULL AND address!=''
       GROUP BY CASE
           WHEN STRPOS(address,'路')>0 AND (STRPOS(address,'街')=0 OR STRPOS(address,'路')<=STRPOS(address,'街'))
             THEN SUBSTRING(address,1,STRPOS(address,'路'))
           WHEN STRPOS(address,'街')>0
             THEN SUBSTRING(address,1,STRPOS(address,'街'))
           ELSE NULL
         END
       HAVING COUNT(*)>=2
         AND CASE
           WHEN STRPOS(address,'路')>0 AND (STRPOS(address,'街')=0 OR STRPOS(address,'路')<=STRPOS(address,'街'))
             THEN SUBSTRING(address,1,STRPOS(address,'路'))
           WHEN STRPOS(address,'街')>0
             THEN SUBSTRING(address,1,STRPOS(address,'街'))
           ELSE NULL
         END IS NOT NULL
       ORDER BY COUNT(*) DESC LIMIT 8`
    ).catch(() => []),
    // 逾期未辦繼承登記土地
    prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM inherited_land WHERE city='${safeC}' AND district='${safeD}'`
    ).catch(() => []),
    // 拍次統計
    prisma.$queryRawUnsafe<{ round_label: string; n: number; avg: number }[]>(
      `SELECT
         CASE
           WHEN auction_round LIKE '%一拍%' OR auction_round LIKE '%1拍%' THEN '一拍'
           WHEN auction_round LIKE '%二拍%' OR auction_round LIKE '%2拍%' THEN '二拍'
           WHEN auction_round LIKE '%三拍%' OR auction_round LIKE '%3拍%' THEN '三拍'
           WHEN auction_round LIKE '%應買%' THEN '應買'
           ELSE '其他'
         END as round_label,
         COUNT(*) as n,
         AVG(CASE WHEN price>0 THEN price END) as avg
       FROM houses
       WHERE city='${safeC}' AND district='${safeD}'
         AND auction_round IS NOT NULL AND auction_round!=''
       GROUP BY round_label
       ORDER BY n DESC`
    ).catch(() => []),
  ]);

  const st = statsRows[0];
  if (!st || Number(st.n) === 0) notFound();

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 聚合乾淨類型
  const typeMap = new Map<string, number>();
  for (const row of typeRows) {
    const clean = cleanType(row.type);
    if (clean) typeMap.set(clean, (typeMap.get(clean) || 0) + Number(row.n));
  }
  const cleanTypeList = [...typeMap.entries()]
    .map(([type, n]) => ({ type, n }))
    .sort((a, b) => b.n - a.n);

  const totalUnfiltered = Number(st.n);
  const filteredCount   = Number(countRow[0]?.n || 0);
  const totalPages      = Math.ceil(filteredCount / PAGE_SIZE);
  const avgWan = st.avg ? Math.floor(Number(st.avg) / 10000) : null;
  const loWan  = st.lo  ? Math.floor(Number(st.lo)  / 10000) : null;
  const hiWan  = st.hi  ? Math.floor(Number(st.hi)  / 10000) : null;
  const latest = st.latest || null;

  // 實價登錄均價 & 折扣率
  const lvrAvgPrice  = lvrRow[0]?.avg_price ? Number(lvrRow[0].avg_price) : null;
  const lvrAvgWan    = lvrAvgPrice ? Math.floor(lvrAvgPrice / 10000) : null;
  const discountPct  = (st.avg && lvrAvgPrice && lvrAvgPrice > 0)
    ? Math.round((1 - Number(st.avg) / lvrAvgPrice) * 100)
    : null;
  const fmtWan = (v: number | null) => v ? `${v.toLocaleString()} 萬` : '—';
  const hasFilter = !!(delivery || typeFilter || priceMin !== null || priceMax !== null);
  const relatedPeriods = c.includes('台中') ? (TAICHUNG_DISTRICT_PERIODS[d] || []) : [];
  const inheritedCount = Number(inheritedRows?.[0]?.n ?? 0);

  const q = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number | undefined> = {
      sort,
      delivery:   delivery   || undefined,
      priceMin:   priceMin   ?? undefined,
      priceMax:   priceMax   ?? undefined,
      typeFilter: typeFilter || undefined,
    };
    const merged = { ...base, ...overrides };
    const pairs = Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined && v !== null);
    const qs = pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `/auction/${city}/${district}${qs ? `?${qs}` : ''}`;
  };

  const pageHref = (p: number) => q({ page: p > 1 ? p : undefined });

  const priceOpts = [
    { label: '不限',          min: '',     max: ''     },
    { label: '500 萬以下',    min: '',     max: '500'  },
    { label: '500–1,000 萬',  min: '500',  max: '1000' },
    { label: '1,000–2,000 萬',min: '1000', max: '2000' },
    { label: '2,000 萬以上',  min: '2000', max: ''     },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }

        .fp-crumb { color: #bbb; font-size: 11px; text-decoration: none; transition: color .15s; }
        .fp-crumb:hover { color: #c2632a; }

        /* ── 篩選區 ── */
        .filter-block {
          background: #fff;
          border-bottom: 2px solid #ececec;
        }
        .filter-inner {
          max-width: 960px;
          margin: 0 auto;
          padding: .85rem clamp(1rem,3vw,1.75rem);
          display: flex;
          flex-direction: column;
          gap: .7rem;
        }
        .filter-row {
          display: flex;
          align-items: center;
          gap: .5rem;
          flex-wrap: wrap;
        }
        .filter-label {
          font-size: .72rem;
          font-weight: 500;
          letter-spacing: .1em;
          color: #aaa;
          width: 52px;
          flex-shrink: 0;
        }
        .filter-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          flex: 1;
        }
        .pill {
          display: inline-block;
          padding: .28rem .75rem;
          font-size: .8rem;
          color: #666;
          background: #fafafa;
          border: 1px solid #e0e0e0;
          border-radius: 2px;
          text-decoration: none;
          transition: all .15s;
          white-space: nowrap;
        }
        .pill:hover { border-color: #c2632a; color: #c2632a; background: #fffaf8; }
        .pill.active { background: #c2632a; color: #fff; border-color: #c2632a; font-weight: 500; }

        /* 自訂價格輸入 */
        .price-custom {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-left: 2px;
        }
        .price-input {
          width: 72px;
          padding: .27rem .45rem;
          font-size: .78rem;
          border: 1px solid #e0e0e0;
          border-radius: 2px;
          outline: none;
          font-family: 'Noto Sans TC', sans-serif;
          color: #444;
          background: #fafafa;
        }
        .price-input:focus { border-color: #f0c4a0; background: #fffaf8; }
        .price-sep { font-size: .72rem; color: #ccc; }
        .price-submit {
          padding: .28rem .7rem;
          font-size: .78rem;
          background: #555;
          color: #fff;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-family: 'Noto Sans TC', sans-serif;
          transition: background .15s;
        }
        .price-submit:hover { background: #c2632a; }

        .clear-link {
          font-size: .75rem;
          color: #bbb;
          text-decoration: none;
          margin-left: auto;
          white-space: nowrap;
          padding: .2rem .4rem;
          border: 1px solid #ececec;
          border-radius: 2px;
          transition: all .15s;
        }
        .clear-link:hover { color: #c2632a; border-color: #f0c4a0; }

        /* 代標精選 badge */
        .badge-featured { background: linear-gradient(90deg,#c2632a,#e07340) !important; color:#fff !important; border:none !important; font-weight:600; }
        /* 已結標 badge */
        .badge-expired { background: #f0f0ee !important; color: #aaa !important; border-color: #e0e0dc !important; }

        /* ── 物件卡片 ── */
        .card-list { display: flex; flex-direction: column; gap: 1px; }
        /* 已結標卡片：灰階弱化 */
        .house-card.expired { opacity: .58; filter: grayscale(30%); }
        .house-card.expired .card-title { color: #999; }
        .house-card.expired .card-price { color: #bbb !important; }
        .house-card.expired .card-price small { color: #bbb !important; }
        .house-card.expired .card-thumb { opacity: .12; }
        .house-card.expired:hover { opacity: .75; filter: grayscale(15%); }
        .house-card {
          background: #fff;
          border: 1px solid #ececec;
          display: grid;
          grid-template-columns: 120px 1fr auto;
          align-items: stretch;
          transition: box-shadow .18s;
          text-decoration: none;
          color: inherit;
        }
        .house-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.07); position: relative; }
        .house-card:hover .card-title { color: #c2632a; }
        .card-thumb {
          background: #f5f5f3;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.75rem; opacity: .25; width: 120px; flex-shrink: 0;
        }
        .card-body { padding: .85rem 1rem; min-width: 0; display: flex; flex-direction: column; gap: .35rem; }
        .card-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: .15rem; }
        .card-badge { font-size: 10px; font-weight: 500; letter-spacing: .06em; padding: .18rem .55rem; border-radius: 1px; }
        .card-title {
          font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 500;
          color: #333; line-height: 1.55;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          transition: color .15s;
        }
        .card-meta { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; }
        .card-meta-item { font-size: .78rem; color: #999; font-weight: 300; }
        .card-meta-item strong { color: #555; font-weight: 400; }
        .card-date { font-size: .78rem; color: #bbb; font-weight: 300; }
        .card-price-col {
          padding: .85rem 1.1rem;
          display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between;
          border-left: 1px solid #f5f5f5; min-width: 110px; flex-shrink: 0;
        }
        .card-price-label { font-size: 9.5px; color: #ccc; letter-spacing: .08em; }
        .card-price { font-family: 'Noto Serif TC', serif; font-size: 1.4rem; font-weight: 600; color: #c2632a; line-height: 1.2; }
        .card-price small { font-size: .7rem; font-weight: 400; color: #c2632a; margin-left: 2px; }
        .card-unit { font-size: .72rem; color: #bbb; font-weight: 300; }
        .card-arrow { font-size: .75rem; color: #ccc; transition: color .15s; }
        .house-card:hover .card-arrow { color: #c2632a; }

        /* ── 分頁 ── */
        .pagination { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 2rem 0; flex-wrap: wrap; }
        .page-btn { padding: .4rem .85rem; font-size: .8rem; border: 1px solid #ddd; background: #fff; color: #555; text-decoration: none; border-radius: 2px; transition: all .15s; }
        .page-btn:hover { border-color: #c2632a; color: #c2632a; }
        .page-btn.active { background: #c2632a; color: #fff; border-color: #c2632a; }
        .page-btn.disabled { color: #ddd; border-color: #ececec; pointer-events: none; }

        .other-dist { display: inline-block; padding: .35rem .8rem; margin: .25rem; font-size: .8rem; background: #fff; border: 1px solid #ececec; border-radius: 2px; color: #555; text-decoration: none; transition: all .15s; }
        .other-dist:hover { border-color: #c2632a; color: #c2632a; }

        @media (max-width: 640px) {
          .house-card { grid-template-columns: 80px 1fr; }
          .card-price-col { display: none; }
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .filter-label { width: 36px; font-size: .68rem; }
        }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',          item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}` },
          { '@type': 'ListItem', position: 2, name: `${c}法拍屋`,    item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/auction/${encodeURIComponent(c)}` },
          { '@type': 'ListItem', position: 3, name: `${c}${d}法拍屋` },
        ],
      }) }} />

      <main style={{ minHeight: '100vh', background: '#f7f6f3', fontFamily: "'Noto Sans TC', sans-serif", paddingBottom: '5rem' }}>

        {/* ── Hero ── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ececec' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(1rem,3vw,1.75rem)' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.2rem 0 .8rem', fontSize: 11, flexWrap: 'wrap' }}>
              {[
                { label: '首頁', href: '/' },
                { label: c,     href: `/auction/${city}` },
                { label: `${d}法拍屋` },
              ].map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {i > 0 && <span style={{ color: '#e0e0e0' }}>›</span>}
                  {'href' in item
                    ? <Link href={item.href!} className="fp-crumb">{item.label}</Link>
                    : <span style={{ color: '#888' }}>{item.label}</span>}
                </span>
              ))}
            </nav>
            <div style={{ padding: 'clamp(.8rem,2vw,1.25rem) 0 clamp(1rem,2.5vw,1.5rem)' }}>
              <p style={{ fontSize: '.75rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.5rem' }}>
                LAW · 法拍屋資訊平台
              </p>
              <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.9rem)', fontWeight: 700, color: '#222', lineHeight: 1.5, marginBottom: '.6rem' }}>
                {c}{d}法拍屋
              </h1>
              <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
                {c}{d}目前共有{' '}
                <strong style={{ color: '#c2632a', fontWeight: 600 }}>{totalUnfiltered.toLocaleString()}</strong>{' '}
                筆法拍物件
                {avgWan ? <>，法拍均價約 <strong style={{ color: '#c2632a', fontWeight: 600 }}>{fmtWan(avgWan)}</strong></> : ''}
                {loWan && hiWan ? `，底價區間 ${fmtWan(loWan)} ～ ${fmtWan(hiWan)}` : ''}
                {cleanTypeList.length > 0 ? `，涵蓋${cleanTypeList.slice(0, 3).map(t => t.type).join('、')}等類型` : ''}
                。
                {lvrAvgWan && discountPct !== null && discountPct > 0 && (
                  <>
                    {' '}周邊實際成交均價約{' '}
                    <strong style={{ color: '#2a5298', fontWeight: 600 }}>{lvrAvgWan.toLocaleString()} 萬</strong>
                    ，法拍底價平均比市價低{' '}
                    <strong style={{ color: '#3a7d2c', fontWeight: 600 }}>{discountPct}%</strong>。
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ── 統計四格 ── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ececec' }}>
          <div className="stat-grid" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: '物件總數',     value: `${totalUnfiltered.toLocaleString()} 筆`, accent: true },
              { label: '法拍均價',     value: fmtWan(avgWan) },
              { label: '周邊實價均價', value: lvrAvgWan ? `${lvrAvgWan.toLocaleString()} 萬` : '—', blue: true },
              { label: discountPct !== null && discountPct > 0 ? '底價比市價低' : '最近開標',
                value: discountPct !== null && discountPct > 0 ? `${discountPct}%` : (latest || '—'),
                green: discountPct !== null && discountPct > 0 },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ padding: '1rem clamp(1rem,3vw,1.75rem)', borderRight: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ fontSize: '.72rem', color: '#aaa', letterSpacing: '.06em', marginBottom: '.3rem' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '.95rem', fontWeight: 600, fontFamily: "'Noto Serif TC', serif",
                  color: (s as any).accent ? '#c2632a' : (s as any).blue ? '#2a5298' : (s as any).green ? '#3a7d2c' : '#333' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 篩選區（靜態，不 sticky） ── */}
        <div className="filter-block">
          <div className="filter-inner">

            {/* 排序 */}
            <div className="filter-row">
              <span className="filter-label">排序</span>
              <div className="filter-pills">
                <a href={q({ sort: 'date', page: undefined })}
                  className={`pill${sort === 'date' ? ' active' : ''}`}>依開標日 新→舊</a>
                <a href={q({ sort: 'price', page: undefined })}
                  className={`pill${sort === 'price' ? ' active' : ''}`}>依底價 低→高</a>
              </div>
            </div>

            {/* 點交 */}
            <div className="filter-row">
              <span className="filter-label">點交</span>
              <div className="filter-pills">
                <a href={q({ delivery: undefined, page: undefined })}
                  className={`pill${!delivery ? ' active' : ''}`}>全部</a>
                <a href={q({ delivery: 'yes', page: undefined })}
                  className={`pill${delivery === 'yes' ? ' active' : ''}`}>可點交</a>
                <a href={q({ delivery: 'no', page: undefined })}
                  className={`pill${delivery === 'no' ? ' active' : ''}`}>不點交</a>
              </div>
            </div>

            {/* 物件類型 */}
            {cleanTypeList.length > 0 && (
              <div className="filter-row">
                <span className="filter-label">類型</span>
                <div className="filter-pills">
                  <a href={q({ typeFilter: undefined, page: undefined })}
                    className={`pill${!typeFilter ? ' active' : ''}`}>全部</a>
                  {cleanTypeList.map((row) => (
                    <a key={row.type}
                      href={q({ typeFilter: row.type, page: undefined })}
                      className={`pill${typeFilter === row.type ? ' active' : ''}`}>
                      {row.type}
                      <span style={{ opacity: .5, marginLeft: 4, fontSize: '.72rem' }}>{Number(row.n)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 底價區間 */}
            <div className="filter-row" style={{ alignItems: 'flex-start' }}>
              <span className="filter-label" style={{ paddingTop: '.3rem' }}>底價</span>
              <div style={{ flex: 1 }}>
                <div className="filter-pills" style={{ marginBottom: '.5rem' }}>
                  {priceOpts.map(opt => {
                    const isActive =
                      (priceMin === null ? '' : String(priceMin)) === opt.min &&
                      (priceMax === null ? '' : String(priceMax)) === opt.max;
                    return (
                      <a key={opt.label}
                        href={q({ priceMin: opt.min || undefined, priceMax: opt.max || undefined, page: undefined })}
                        className={`pill${isActive ? ' active' : ''}`}>
                        {opt.label}
                      </a>
                    );
                  })}
                </div>
                {/* 自訂輸入 */}
                <form action={`/auction/${city}/${district}`} method="get" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <input type="hidden" name="sort" value={sort} />
                  {delivery   && <input type="hidden" name="delivery"   value={delivery} />}
                  {typeFilter && <input type="hidden" name="typeFilter" value={typeFilter} />}
                  <span style={{ fontSize: '.75rem', color: '#aaa' }}>自訂：</span>
                  <input className="price-input" type="number" name="priceMin"
                    placeholder="最低（萬）" defaultValue={priceMin ?? ''} min={0} />
                  <span className="price-sep">–</span>
                  <input className="price-input" type="number" name="priceMax"
                    placeholder="最高（萬）" defaultValue={priceMax ?? ''} min={0} />
                  <button type="submit" className="price-submit">套用</button>
                </form>
              </div>
              {hasFilter && (
                <a href={`/auction/${city}/${district}${sort !== 'date' ? `?sort=${sort}` : ''}`}
                  className="clear-link">
                  ✕ 清除篩選
                </a>
              )}
            </div>

          </div>
        </div>

        {/* ── 列表主體 ── */}
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.25rem clamp(1rem,3vw,1.75rem) 0' }}>

          {/* 結果 header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', paddingBottom: '.75rem', borderBottom: '1px solid #ececec', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.95rem', fontWeight: 500, color: '#c2632a' }}>
              最新法拍物件
            </span>
            <span style={{ fontSize: '.82rem', color: '#aaa', fontWeight: 300 }}>
              {filteredCount !== totalUnfiltered
                ? `篩選後 ${filteredCount} 筆（共 ${totalUnfiltered} 筆）`
                : `共 ${filteredCount} 筆`}
            </span>
            <span style={{ fontSize: '.78rem', color: '#ccc', marginLeft: 'auto' }}>
              第 {page} / {totalPages || 1} 頁
            </span>
          </div>

          {/* 物件卡片 */}
          <div className="card-list">
            {listings.length > 0 ? listings.map((h: any) => {
              const priceWan  = h.price ? Math.floor(h.price / 10000) : null;
              const cat       = h.category || '法拍屋';
              const href      = `/${encodeURIComponent(cat)}/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${h.id}`;
              const badgeS    = statusStyle(h.status);
              const shortAddr = h.address ? h.address.replace(c, '').replace(d, '').trim() : '';
              const isExpired = !!h.auction_date && h.auction_date < today;
              // 從 status 欄位解析拍定價，例如「拍定1390萬」→ '1390萬'
              const soldMatch = typeof h.status === 'string' ? h.status.match(/^拍定([\d.,]+萬?)/) : null;
              const soldPrice = soldMatch ? soldMatch[1] : null;
              return (
                <a key={h.id} href={href} className={`house-card${isExpired ? ' expired' : ''}`}>
                  <div className="card-thumb">🏠</div>
                  <div className="card-body">
                    <div className="card-badges">
                      {isExpired && (
                        <span className="card-badge badge-expired">已結標</span>
                      )}
                      {h.is_agent_featured == 1 && (
                        <span className="card-badge badge-featured">★ 代標精選</span>
                      )}
                      {cleanType(h.type) && (
                        <span className="card-badge" style={{ background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' }}>
                          {cleanType(h.type)}
                        </span>
                      )}
                      {!isExpired && h.status && <span className="card-badge" style={badgeS}>{h.status}</span>}
                      {h.delivery && (
                        <span className="card-badge" style={{ background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' }}>
                          ✓ {h.delivery}
                        </span>
                      )}
                      {h.auction_round && (
                        <span className="card-badge" style={{ background: '#fafafa', color: '#aaa', border: '1px solid #e8e8e4' }}>
                          {h.auction_round}
                        </span>
                      )}
                    </div>
                    <div className="card-title">{h.title || h.address || '（無標題）'}</div>
                    <div className="card-meta">
                      {shortAddr && <span className="card-meta-item">📍 {shortAddr}</span>}
                      {h.area    && <span className="card-meta-item"><strong>{h.area}</strong> 坪</span>}
                      {h.layout  && <span className="card-meta-item">{h.layout}</span>}
                      {h.floor   && <span className="card-meta-item">{cleanFloor(h.floor)}</span>}
                    </div>
                    <div className="card-date">📅 開標 {h.auction_date || '—'}</div>
                  </div>
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
                      {!soldPrice && !!h.unit_price && <div className="card-unit">{h.unit_price} 萬/坪</div>}
                    </div>
                    <div className="card-arrow">詳情 →</div>
                  </div>
                </a>
              );
            }) : (
              <div style={{ padding: '3rem 2rem', textAlign: 'center', background: '#fff', border: '1px solid #ececec' }}>
                <div style={{ fontSize: '2rem', marginBottom: '.75rem', opacity: .3 }}>🔍</div>
                <p style={{ fontSize: '.9rem', color: '#888', margin: '0 0 .75rem' }}>目前篩選條件下無符合物件</p>
                <a href={`/auction/${city}/${district}`} style={{ fontSize: '.82rem', color: '#c2632a', textDecoration: 'none' }}>
                  清除所有篩選
                </a>
              </div>
            )}
          </div>

          {/* 分頁 */}
          {totalPages > 1 && (
            <div className="pagination">
              <Link href={pageHref(page - 1)} className={`page-btn${page <= 1 ? ' disabled' : ''}`}>← 上一頁</Link>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce<(number | '…')[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '…'
                    ? <span key={`e${i}`} style={{ color: '#ccc', fontSize: '.8rem' }}>…</span>
                    : <Link key={n} href={pageHref(n as number)} className={`page-btn${n === page ? ' active' : ''}`}>{n}</Link>
                )}
              <Link href={pageHref(page + 1)} className={`page-btn${page >= totalPages ? ' disabled' : ''}`}>下一頁 →</Link>
            </div>
          )}

          {/* 熱門法拍路段 */}
          {roadRows.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.25rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#555', marginTop: 0, marginBottom: '.85rem' }}>
                {d} 熱門法拍路段
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 6 }}>
                {roadRows.map((r: any) => {
                  const avgWanR = r.avg ? Math.floor(Number(r.avg) / 10000) : null;
                  return (
                    <div key={r.road} style={{ background: '#fafafa', border: '1px solid #ececec', padding: '.65rem .9rem', borderRadius: 2 }}>
                      <div style={{ fontSize: '.82rem', color: '#c2632a', fontWeight: 600 }}>{r.road}</div>
                      <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.15rem' }}>{Number(r.n)} 筆法拍</div>
                      {avgWanR && <div style={{ fontSize: '.72rem', color: '#888', marginTop: '.1rem' }}>均底價 {avgWanR.toLocaleString()} 萬</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 拍次統計 */}
          {roundRows.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.25rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#555', marginTop: 0, marginBottom: '.85rem' }}>
                {d} 拍次分布
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 6 }}>
                {roundRows.map((r: any) => {
                  const avgWanR = r.avg ? Math.floor(Number(r.avg) / 10000) : null;
                  const total = roundRows.reduce((s: number, x: any) => s + Number(x.n), 0);
                  const pct = total > 0 ? Math.round(Number(r.n) / total * 100) : 0;
                  return (
                    <div key={r.round_label} style={{ background: '#fafafa', border: '1px solid #ececec', padding: '.65rem .9rem', borderRadius: 2 }}>
                      <div style={{ fontSize: '.88rem', color: '#c2632a', fontWeight: 700 }}>{r.round_label}</div>
                      <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.15rem' }}>{Number(r.n)} 筆・佔 {pct}%</div>
                      {avgWanR && <div style={{ fontSize: '.72rem', color: '#888', marginTop: '.1rem' }}>均底價 {avgWanR.toLocaleString()} 萬</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 同區預售屋入口 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #d1e8d8', padding: '1rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#1a6b3a' }}>周邊預售屋成交行情</div>
              <div style={{ fontSize: '.75rem', color: '#aaa', marginTop: '.2rem' }}>查看 {c}{d} 建案成交記錄與均價</div>
            </div>
            <a href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
              style={{ flexShrink: 0, padding: '.45rem 1rem', background: '#1a6b3a', color: '#fff', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', borderRadius: 2, fontFamily: "'Noto Sans TC', sans-serif" }}>
              查看預售屋 →
            </a>
          </div>

          {/* 重劃區連結（台中各期） */}
          {relatedPeriods.map(period => (
            <div key={period} style={{ background: '#f7f4ff', border: '1px solid #c8b8e8', padding: '1rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#7b5ea7' }}>台中{period}重劃區資訊</div>
                <div style={{ fontSize: '.75rem', color: '#aaa', marginTop: '.2rem' }}>重劃區範圍、建商進駐、法拍與實價行情一覽</div>
              </div>
              <a href={`/land-readjustment/${encodeURIComponent('台中')}/${encodeURIComponent(period)}`}
                style={{ flexShrink: 0, padding: '.45rem 1rem', background: '#7b5ea7', color: '#fff', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', borderRadius: 2, fontFamily: "'Noto Sans TC', sans-serif" }}>
                查看重劃區 →
              </a>
            </div>
          ))}

          {/* 逾期未辦繼承土地連結 */}
          {inheritedCount > 0 && (
            <div style={{ background: '#fff8f4', border: '1px solid #f0c4a0', borderLeft: '4px solid #c2632a', padding: '1rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#c2632a' }}>逾期未辦繼承登記土地公告</div>
                <div style={{ fontSize: '.75rem', color: '#aaa', marginTop: '.2rem' }}>{d} 有 {inheritedCount} 筆登記，公告期間可申請法院代為標售</div>
              </div>
              <a href={`/special-properties/inherited-land/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
                style={{ flexShrink: 0, padding: '.45rem 1rem', background: '#c2632a', color: '#fff', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', borderRadius: 2, fontFamily: "'Noto Sans TC', sans-serif" }}>
                查看公告 →
              </a>
            </div>
          )}

          {/* 同縣市其他行政區 */}
          {otherDistricts.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.5rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.95rem', fontWeight: 700, color: '#555', marginBottom: '1rem', marginTop: 0 }}>
                {c} 其他行政區法拍屋
              </h2>
              {otherDistricts.map((r: any) => (
                <Link key={r.district}
                  href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(r.district)}`}
                  className="other-dist">
                  {r.district}
                  <span style={{ color: '#bbb', fontSize: '.72rem', marginLeft: 4 }}>({Number(r.n)})</span>
                </Link>
              ))}
            </div>
          )}

          {/* ── 行政區描述文字 ── */}
          <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.5rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.95rem', fontWeight: 700, color: '#555', marginBottom: '.85rem', marginTop: 0 }}>
              關於{c}{d}法拍市場
            </h2>
            <p style={{ fontSize: '.82rem', color: '#666', fontWeight: 300, lineHeight: 2.1, margin: 0 }}>
              {c}{d}法拍市場目前共有{' '}
              <strong style={{ color: '#c2632a', fontWeight: 600 }}>{totalUnfiltered.toLocaleString()} 筆</strong>物件
              {cleanTypeList.length > 0 && (
                <>，以 <strong style={{ color: '#555', fontWeight: 500 }}>{cleanTypeList[0].type}</strong> 為主要類型
                {cleanTypeList.length > 1 && <>，其次為 {cleanTypeList[1].type}</>}
                </>
              )}
              {avgWan && <>，法拍底價均價約 <strong style={{ color: '#c2632a', fontWeight: 600 }}>{avgWan.toLocaleString()} 萬</strong></>}
              {loWan && hiWan && <>，底價區間 {loWan.toLocaleString()} 萬 ～ {hiWan.toLocaleString()} 萬</>}
              。
              {lvrAvgWan ? (
                discountPct !== null && discountPct > 0
                  ? <>相較於周邊實際成交均價約 <strong style={{ color: '#2a5298', fontWeight: 600 }}>{lvrAvgWan.toLocaleString()} 萬</strong>，法拍底價平均低 <strong style={{ color: '#3a7d2c', fontWeight: 600 }}>{discountPct}%</strong>，對具備資金實力的投資人具有相當吸引力。</>
                  : <>周邊實際成交均價約 <strong style={{ color: '#2a5298', fontWeight: 600 }}>{lvrAvgWan.toLocaleString()} 萬</strong>，可作為投標出價的市場參考。</>
              ) : null}
              {` 有意參與${c}${d}法拍的買家，建議投標前至司法院官網確認最新底價與開標時間，並評估產權狀況與點交條件。`}
            </p>
          </div>

          <div style={{ background: '#fff8f4', borderLeft: '4px solid #c2632a', borderTop: '1px solid #f0c4a0', borderBottom: '1px solid #f0c4a0', padding: '1.25rem clamp(1.25rem,3vw,1.75rem)', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '.8rem', color: '#b07340', fontWeight: 300, lineHeight: 2, margin: 0 }}>
              本平台資料僅供參考，一切以法院或執行單位公告為準。投標前請至司法院官網確認最新底價與開標資訊。
            </p>
          </div>

        </div>
      </main>
    </>
  );
}
