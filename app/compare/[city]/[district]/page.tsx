import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

type Params = Promise<{ city: string; district: string }>;

const toWanPerPing = (u: number) => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  return {
    title: `${c}${d} 行情比較 | 與同縣市各行政區橫向對照`,
    description: `${c}${d}與同縣市各行政區的實價均坪、法拍均底、預售均坪、成交量橫向比較，快速判斷區域相對行情高低。`,
    alternates: { canonical: `/compare/${city}/${district}` },
  };
}

export default async function CompareDistrictPage({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  let lvrRows: any[]     = [];
  let presaleRows: any[] = [];
  let auctionRows: any[] = [];

  try {
    [lvrRows, presaleRows, auctionRows] = await Promise.all([
      // 實價成屋：同縣市各區（近兩年建物成交）
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT district,
                COUNT(*) as n,
                AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price
         FROM lvr_land
         WHERE city = '${safeC}'
           AND tx_type LIKE '%建物%' AND total_price > 0
           AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
         GROUP BY district ORDER BY n DESC`
      ),
      // 預售屋：同縣市各區
      prismaLvr.$queryRawUnsafe<any[]>(
        `SELECT district,
                COUNT(*) as n,
                AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_presale
         WHERE city = '${safeC}' AND total_price > 0
         GROUP BY district ORDER BY n DESC`
      ).catch(() => []),
      // 法拍：同縣市各區
      prisma.$queryRawUnsafe<any[]>(
        `SELECT district,
                COUNT(*) as n,
                AVG(CASE WHEN price > 0 THEN price END) as avg_price
         FROM houses
         WHERE city = '${safeC}'
         GROUP BY district ORDER BY n DESC`
      ).catch(() => []),
    ]);
  } catch { /* ignore */ }

  if (lvrRows.length === 0) notFound();

  // 確認查詢的行政區存在於資料中
  const districtExists = lvrRows.some((r: any) => r.district === d)
    || presaleRows.some((r: any) => r.district === d)
    || auctionRows.some((r: any) => r.district === d);
  if (!districtExists) notFound();

  // ── 建立快速查詢 map ──────────────────────────────────────────────────────
  const lvrMap     = new Map(lvrRows.map((r: any)     => [r.district, r]));
  const presaleMap = new Map(presaleRows.map((r: any)  => [r.district, r]));
  const auctionMap = new Map(auctionRows.map((r: any)  => [r.district, r]));

  // 所有行政區（以實價為主，補入法拍/預售有但實價沒有的）
  const allDistricts = [
    ...new Set([
      ...lvrRows.map((r: any) => r.district),
      ...presaleRows.map((r: any) => r.district),
      ...auctionRows.map((r: any) => r.district),
    ])
  ].filter(Boolean);

  // 目前行政區的資料
  const curLvr     = lvrMap.get(d);
  const curPresale = presaleMap.get(d);
  const curAuction = auctionMap.get(d);

  const curLvrUnit     = curLvr?.avg_unit    ? toWanPerPing(Number(curLvr.avg_unit)) : null;
  const curPresaleUnit = curPresale?.avg_unit ? toWanPerPing(Number(curPresale.avg_unit)) : null;
  const curAuctionAvg  = curAuction?.avg_price ? Math.round(Number(curAuction.avg_price) / 10000) : null;

  // ── 各指標最大值（用於 bar 寬度） ────────────────────────────────────────
  const maxLvrUnit = Math.max(...lvrRows.map((r: any) => r.avg_unit ? toWanPerPing(Number(r.avg_unit)) : 0), 0.001);
  const maxPresaleUnit = Math.max(...presaleRows.map((r: any) => r.avg_unit ? toWanPerPing(Number(r.avg_unit)) : 0), 0.001);
  const maxAuctionAvg = Math.max(...auctionRows.map((r: any) => r.avg_price ? Number(r.avg_price) / 10000 : 0), 0.001);
  const maxLvrN = Math.max(...lvrRows.map((r: any) => Number(r.n)), 1);

  // ── 排序：實價均坪由高到低 ─────────────────────────────────────────────────
  const sortedDistricts = [...allDistricts].sort((a, b) => {
    const ua = lvrMap.get(a)?.avg_unit ? toWanPerPing(Number(lvrMap.get(a).avg_unit)) : 0;
    const ub = lvrMap.get(b)?.avg_unit ? toWanPerPing(Number(lvrMap.get(b).avg_unit)) : 0;
    return ub - ua;
  });

  const curRank = sortedDistricts.indexOf(d) + 1;

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
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .kpi4 { display: grid; grid-template-columns: repeat(4,1fr); background: #fff; border-bottom: 1px solid #ececec; }
        .kpi-cell { padding: 1rem 1.25rem; border-right: 1px solid #f0f0f0; }
        .kpi-cell:last-child { border-right: none; }
        .kpi-val { font-family: 'Noto Serif TC', serif; font-size: 1.15rem; font-weight: 700; color: #2a5298; }
        .kpi-lbl { font-size: .68rem; color: #aaa; margin-top: .15rem; }
        .kpi-rank { font-size: .68rem; color: #c2632a; font-weight: 500; margin-top: .15rem; }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .5rem 1rem; background: #f0f5ff; margin: 1.5rem 0 .75rem; display: flex; align-items: center; justify-content: space-between; }
        .sec-head span { font-size: .68rem; color: #aaa; font-weight: 300; font-family: 'Noto Sans TC', sans-serif; }

        /* 比較表格 */
        .cmp-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e8f8; font-size: .8rem; }
        .cmp-table th { background: #f0f5ff; color: #2a5298; font-weight: 600; padding: .55rem .85rem; text-align: left; border-bottom: 2px solid #c8d8f0; font-size: .72rem; letter-spacing: .04em; white-space: nowrap; }
        .cmp-table th:not(:first-child) { text-align: right; }
        .cmp-row td { padding: .55rem .85rem; border-bottom: 1px solid #f0f5ff; vertical-align: middle; }
        .cmp-row td:not(:first-child) { text-align: right; }
        .cmp-row.active { background: #f0f5ff; }
        .cmp-row.active td:first-child { font-weight: 700; color: #2a5298; }
        .cmp-row:hover { background: #f7faff; }
        .cmp-dist { color: #333; text-decoration: none; }
        .cmp-dist:hover { color: #2a5298; text-decoration: underline; }
        .bar-wrap { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
        .bar-bg { flex: 1; max-width: 100px; height: 6px; background: #e8eef8; border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 3px; background: #2a5298; }
        .bar-fill.orange { background: #c2632a; }
        .bar-fill.green { background: #1a6b3a; }
        .val-num { font-family: 'Noto Serif TC', serif; font-weight: 600; color: #2a5298; min-width: 52px; text-align: right; white-space: nowrap; }
        .val-num.orange { color: #c2632a; }
        .val-num.green { color: #1a6b3a; }
        .val-dim { color: #ccc; font-weight: 300; min-width: 52px; text-align: right; }
        .cur-star { display: inline-block; margin-right: 4px; font-size: 9px; color: #2a5298; }

        /* 捷徑按鈕 */
        .shortcut-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .shortcut-btn { display: inline-block; padding: .4rem .85rem; background: #fff; border: 1px solid #b8d0f0; color: #2a5298; font-size: .78rem; font-weight: 500; text-decoration: none; border-radius: 2px; transition: all .15s; }
        .shortcut-btn:hover { background: #f0f5ff; border-color: #2a5298; }
        .shortcut-btn.orange { border-color: #f0c4a0; color: #c2632a; }
        .shortcut-btn.orange:hover { background: #fff8f4; border-color: #c2632a; }
        .shortcut-btn.green { border-color: #a8d5b5; color: #1a6b3a; }
        .shortcut-btn.green:hover { background: #f0fdf4; border-color: #1a6b3a; }

        @media(max-width:640px){
          .kpi4 { grid-template-columns: 1fr 1fr; }
          .kpi-cell:nth-child(2) { border-right: none; }
          .kpi-cell:nth-child(3) { border-top: 1px solid #f0f0f0; }
          .bar-bg { max-width: 60px; }
        }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',    item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '行情比較', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/compare` },
          { '@type': 'ListItem', position: 3, name: c,          item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/compare/${encodeURIComponent(c)}` },
          { '@type': 'ListItem', position: 4, name: d },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>行情比較</a>
          <a href="/price"   className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/presale" className="nav-link" style={{ color: '#1a6b3a' }}>預售屋</a>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: '#fff', borderBottom: '4px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/compare" className="crumb">行情比較</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#444' }}>{c}</span>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#2a5298', fontWeight: 500 }}>{d}</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.4rem' }}>COMPARE · 行情比較</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            {c} {d}・行情橫向比較
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            與 {c} 其他 {sortedDistricts.length - 1} 個行政區比較
            {curLvrUnit !== null && <>，{d}實價均坪 <strong style={{ color: '#2a5298' }}>{curLvrUnit.toFixed(1)} 萬</strong></>}
            {curRank > 0 && <>，排名第 <strong style={{ color: '#c2632a' }}>{curRank}</strong> 位</>}。
          </p>
        </div>
      </div>

      {/* KPI 四格 */}
      <div className="kpi4">
        {[
          {
            label: `實價均坪（萬/坪）`,
            value: curLvrUnit !== null ? `${curLvrUnit.toFixed(1)}` : '—',
            rank: curRank > 0 ? `${c}排名第 ${curRank} 位` : '',
          },
          {
            label: '近兩年成交量（筆）',
            value: curLvr ? Number(curLvr.n).toLocaleString() : '—',
            rank: '',
          },
          {
            label: '預售均坪（萬/坪）',
            value: curPresaleUnit !== null ? `${curPresaleUnit.toFixed(1)}` : '—',
            rank: '',
          },
          {
            label: '法拍均底（萬）',
            value: curAuctionAvg !== null ? `${curAuctionAvg.toLocaleString()}` : '—',
            rank: '',
          },
        ].map((kpi, i) => (
          <div key={i} className="kpi-cell">
            <div className="kpi-lbl">{kpi.label}</div>
            <div className="kpi-val">{kpi.value}</div>
            {kpi.rank && <div className="kpi-rank">{kpi.rank}</div>}
          </div>
        ))}
      </div>

      <div className="wrap">

        {/* 捷徑按鈕 */}
        <div className="shortcut-row">
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="shortcut-btn">
            📊 {d} 實價登錄
          </a>
          <a href={`/auction/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="shortcut-btn orange">
            🏛️ {d} 法拍屋
          </a>
          <a href={`/presale/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="shortcut-btn green">
            🏗️ {d} 預售建案
          </a>
          <a href="/compare" className="shortcut-btn" style={{ color: '#888', borderColor: '#ddd' }}>
            ← 選其他行政區
          </a>
        </div>

        {/* ── 比較主表格 ─────────────────────────────────────────────────── */}
        <div className="sec-head">
          <span>{c} 各行政區行情比較（實價均坪排序）</span>
          <span>近兩年建物成交・{sortedDistricts.length} 個行政區</span>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th style={{ minWidth: 80 }}>行政區</th>
                <th style={{ minWidth: 130 }}>實價均坪（萬/坪）</th>
                <th style={{ minWidth: 110 }}>成交量（筆）</th>
                <th style={{ minWidth: 130 }}>預售均坪（萬/坪）</th>
                <th style={{ minWidth: 110 }}>法拍均底（萬）</th>
              </tr>
            </thead>
            <tbody>
              {sortedDistricts.map((dist, idx) => {
                const isCur  = dist === d;
                const lvr    = lvrMap.get(dist);
                const pre    = presaleMap.get(dist);
                const auc    = auctionMap.get(dist);

                const lvrUnit    = lvr?.avg_unit    ? toWanPerPing(Number(lvr.avg_unit)) : null;
                const preUnit    = pre?.avg_unit     ? toWanPerPing(Number(pre.avg_unit)) : null;
                const aucAvg     = auc?.avg_price    ? Number(auc.avg_price) / 10000 : null;
                const lvrN       = lvr ? Number(lvr.n) : 0;

                const lvrBarPct     = lvrUnit    ? Math.round(lvrUnit    / maxLvrUnit    * 100) : 0;
                const preBarPct     = preUnit    ? Math.round(preUnit    / maxPresaleUnit * 100) : 0;
                const aucBarPct     = aucAvg     ? Math.round(aucAvg    / maxAuctionAvg  * 100) : 0;
                const lvrNBarPct    = lvrN       ? Math.round(lvrN      / maxLvrN        * 100) : 0;

                return (
                  <tr key={dist} className={`cmp-row${isCur ? ' active' : ''}`}>
                    <td>
                      {isCur && <span className="cur-star">★</span>}
                      <a href={`/compare/${encodeURIComponent(c)}/${encodeURIComponent(dist)}`}
                        className="cmp-dist"
                        style={isCur ? { color: '#2a5298', pointerEvents: 'none' } : {}}>
                        {dist}
                      </a>
                    </td>
                    {/* 實價均坪 */}
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-bg">
                          <div className="bar-fill" style={{ width: `${lvrBarPct}%`, opacity: isCur ? 1 : 0.55 }} />
                        </div>
                        {lvrUnit !== null
                          ? <span className="val-num">{lvrUnit.toFixed(1)}</span>
                          : <span className="val-dim">—</span>}
                      </div>
                    </td>
                    {/* 成交量 */}
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-bg">
                          <div className="bar-fill" style={{ width: `${lvrNBarPct}%`, opacity: isCur ? 1 : 0.4 }} />
                        </div>
                        {lvrN > 0
                          ? <span className="val-num" style={{ fontSize: '.72rem', color: '#555' }}>{lvrN.toLocaleString()}</span>
                          : <span className="val-dim">—</span>}
                      </div>
                    </td>
                    {/* 預售均坪 */}
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-bg">
                          <div className="bar-fill green" style={{ width: `${preBarPct}%`, opacity: isCur ? 1 : 0.55 }} />
                        </div>
                        {preUnit !== null
                          ? <span className="val-num green">{preUnit.toFixed(1)}</span>
                          : <span className="val-dim">—</span>}
                      </div>
                    </td>
                    {/* 法拍均底 */}
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-bg">
                          <div className="bar-fill orange" style={{ width: `${aucBarPct}%`, opacity: isCur ? 1 : 0.55 }} />
                        </div>
                        {aucAvg !== null
                          ? <span className="val-num orange">{Math.round(aucAvg).toLocaleString()}</span>
                          : <span className="val-dim">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 說明 */}
        <div style={{ background: '#f0f5ff', border: '1px solid #c8d8f0', borderLeft: '4px solid #2a5298', padding: '1rem 1.25rem', fontSize: '.78rem', color: '#6b8cc7', lineHeight: 1.9 }}>
          <strong style={{ color: '#2a5298' }}>資料說明</strong><br />
          ・實價均坪：內政部實價登錄近兩年建物成交，每坪成交均價（萬元）<br />
          ・成交量：近兩年建物（住宅類）成交總筆數<br />
          ・預售均坪：內政部預售屋備查資料，每坪成交均價（萬元）<br />
          ・法拍均底：司法院法拍公告底價平均值（萬元），非成交價
        </div>

      </div>
    </>
  );
}
