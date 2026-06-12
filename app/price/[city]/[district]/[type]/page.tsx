import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string; type: string }>;
type SearchParams = Promise<{ page?: string; sort?: string; priceMin?: string; priceMax?: string }>;

const sqmToPing        = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number) => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district, type } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const t = decodeURIComponent(type);

  let avg = 0, n = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n, AVG(CASE WHEN total_price>0 THEN total_price END) as avg
       FROM lvr_land WHERE city='${c.replace(/'/g, "''")}' AND district='${d.replace(/'/g, "''")}' AND building_type='${t.replace(/'/g, "''")}' AND tx_type LIKE '%建物%'`
    );
    avg = rows[0]?.avg ? Math.round(Number(rows[0].avg) / 10000) : 0;
    n   = Number(rows[0]?.n || 0);
  } catch { /* ignore */ }

  return {
    title: `${c}${d}${t}實價登錄 | 成交均價・歷年行情`,
    description: `${c}${d}${t}實際成交資料，共 ${n} 筆${avg ? `，均價約 ${avg} 萬` : ''}。查看${t}歷年成交走勢、每坪單價與實際案例。`,
    alternates: { canonical: `/price/${city}/${district}/${type}` },
  };
}

export default async function PriceTypePage({
  params, searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { city, district, type } = await params;
  const sp = await searchParams;

  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const t = decodeURIComponent(type);

  const page     = Math.max(1, parseInt(sp.page || '1', 10));
  const priceMin = sp.priceMin ? parseInt(sp.priceMin, 10) : null;
  const priceMax = sp.priceMax ? parseInt(sp.priceMax, 10) : null;
  const sort     = sp.sort || 'date';
  const pageSize = 30;

  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");
  const safeT = t.replace(/'/g, "''");

  const baseConds = [
    `city='${safeC}'`, `district='${safeD}'`,
    `building_type='${safeT}'`, `tx_type LIKE '%建物%'`,
  ];
  if (priceMin !== null) baseConds.push(`total_price >= ${priceMin * 10000}`);
  if (priceMax !== null) baseConds.push(`total_price <= ${priceMax * 10000}`);
  const where = baseConds.join(' AND ');

  const orderBy = sort === 'price'
    ? `CASE WHEN total_price IS NULL OR total_price=0 THEN 1 ELSE 0 END, total_price DESC`
    : `CASE WHEN tx_date_iso IS NULL OR tx_date_iso='' THEN 1 ELSE 0 END, tx_date_iso DESC`;

  let records: any[] = [];
  let totalCount = 0;
  let stats: any  = null;
  let yearTrend: any[] = [];
  let otherTypes: any[] = [];

  try {
    const [fetched, countRows, statsRows, trendRows, otherRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_land WHERE ${where} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      ),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as n FROM lvr_land WHERE ${where}`),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price > 0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                MAX(CASE WHEN total_price > 0 THEN total_price END) as max_p,
                MIN(CASE WHEN total_price > 0 THEN total_price END) as min_p,
                MAX(tx_date_iso) as latest
         FROM lvr_land WHERE ${where}`,
      ),
      // 年度趨勢
      prisma.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}' AND building_type='${safeT}'
           AND tx_type LIKE '%建物%' AND tx_date_iso IS NOT NULL AND total_price > 0
         GROUP BY SUBSTRING(tx_date_iso, 1, 4) HAVING SUBSTRING(tx_date_iso, 1, 4) >= '2020' ORDER BY 1`,
      ),
      // 同行政區其他建物類型入口
      prisma.$queryRawUnsafe<any[]>(
        `SELECT building_type, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg
         FROM lvr_land
         WHERE city='${safeC}' AND district='${safeD}' AND tx_type LIKE '%建物%'
           AND building_type IS NOT NULL AND building_type != '' AND building_type != '${safeT}'
         GROUP BY building_type ORDER BY n DESC LIMIT 6`,
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    records    = fetched;
    totalCount = Number(countRows[0].n);
    stats      = statsRows[0];
    yearTrend  = trendRows;
    otherTypes = otherRows;
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const avgWan     = stats.avg  ? Math.round(Number(stats.avg) / 10000) : null;
  const avgUnit    = stats.avg_unit ? unitSqmToWanPerPing(Number(stats.avg_unit)) : null;
  const maxWan     = stats.max_p ? Math.round(Number(stats.max_p) / 10000) : null;
  const minWan     = stats.min_p ? Math.round(Number(stats.min_p) / 10000) : null;
  const maxAvgTrend = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;

  const q = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number | undefined> = {
      page, sort, priceMin: priceMin ?? undefined, priceMax: priceMax ?? undefined,
    };
    const merged = { ...base, ...overrides };
    const pairs = Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined);
    const qs = pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(t)}${qs ? '?' + qs : ''}`;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; transition: all .15s; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .tx-card { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 1fr auto; align-items: stretch; }
        .card-body { padding: .85rem 1rem; min-width: 0; }
        .card-addr { font-family: 'Noto Serif TC', serif; font-size: .88rem; font-weight: 500; color: #333; line-height: 1.6; margin-bottom: .3rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .card-meta { display: flex; flex-wrap: wrap; gap: .4rem 1rem; font-size: .75rem; color: #999; }
        .card-date { font-size: .72rem; color: #bbb; font-weight: 300; margin-top: .4rem; }
        .price-col { padding: .85rem 1.1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #f0f5ff; min-width: 100px; flex-shrink: 0; gap: .25rem; }
        .price-val { font-family: 'Noto Serif TC', serif; font-size: 1.3rem; font-weight: 700; color: #2a5298; }
        .price-val small { font-size: .68rem; font-weight: 400; color: #2a5298; margin-left: 2px; }
        .price-unit { font-size: .75rem; color: #aaa; }
        .page-btn { display: inline-block; padding: .42rem .85rem; font-size: .8rem; color: #888; background: #fff; border: 1px solid #e0e8f8; text-decoration: none; }
        .page-btn:hover { border-color: #2a5298; color: #2a5298; }
        .page-btn.active { background: #2a5298; color: #fff; border-color: #2a5298; }
        .page-btn.disabled { color: #ddd; border-color: #f0f0f0; pointer-events: none; }
        .type-chip { display: inline-block; padding: .3rem .8rem; font-size: .78rem; border: 1px solid #e0e8f8; background: #fff; color: #555; text-decoration: none; transition: all .15s; }
        .type-chip:hover { border-color: #2a5298; color: #2a5298; background: #f0f5ff; }
        @media(max-width:640px){ .price-col { display: none; } }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link" style={{ color: '#2a5298' }}>實價登錄</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem) 5rem' }}>

        {/* 麵包屑 */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11, flexWrap: 'wrap' }}>
          <a href="/" className="crumb">首頁</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href="/price" className="crumb">實價登錄</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}`} className="crumb">{c}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="crumb">{d}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#2a5298', fontWeight: 500 }}>{t}</span>
        </nav>

        {/* Hero */}
        <div style={{ background: '#fff', borderTop: '3px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.18em', color: '#2a5298', marginBottom: '.5rem' }}>
            REAL PRICE · 實價登錄
          </p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.85rem)', fontWeight: 700, color: '#1e3a6e', lineHeight: 1.5, marginBottom: '.6rem' }}>
            {c}{d} {t} 實價登錄
          </h1>
          <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            共 <strong style={{ color: '#2a5298' }}>{totalCount.toLocaleString()}</strong> 筆{t}成交紀錄
            {avgWan && <>，均價約 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪約 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬</strong></>}
            {minWan && maxWan && minWan !== maxWan && <>，成交區間 {minWan.toLocaleString()}～{maxWan.toLocaleString()} 萬</>}。
          </p>
        </div>

        {/* 統計四格 */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ececec', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginBottom: '1.25rem' }}>
          {[
            { label: '成交筆數',   value: `${totalCount.toLocaleString()} 筆`, accent: true },
            { label: '成交均價',   value: avgWan ? `${avgWan.toLocaleString()} 萬` : '—' },
            { label: '每坪均價',   value: avgUnit ? `${avgUnit.toFixed(1)} 萬` : '—' },
            { label: '最新成交日', value: stats.latest?.slice(0, 10) || '—' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ padding: '1rem clamp(.75rem,2vw,1.25rem)', borderRight: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ fontSize: '.72rem', color: '#aaa', letterSpacing: '.05em', marginBottom: '.3rem' }}>{s.label}</div>
              <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.95rem', fontWeight: 600, color: (s as any).accent ? '#2a5298' : '#333' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 年度走勢 */}
        {yearTrend.length >= 2 && (
          <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
            <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>
                {t} 歷年成交均價走勢
              </span>
              <span style={{ fontSize: '.72rem', color: '#8aabdf' }}>{yearTrend[0]?.year}～{yearTrend[yearTrend.length-1]?.year}</span>
            </div>
            <div style={{ padding: '1rem 1rem .75rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 120 }}>
              {yearTrend.map((r: any) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const pct = r.avg_price ? Math.round((Number(r.avg_price) / maxAvgTrend) * 85) + 10 : 10;
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: '.68rem', color: '#2a5298', fontWeight: 600 }}>{avgW ? `${avgW.toLocaleString()}萬` : '—'}</div>
                    {unitW && <div style={{ fontSize: '.62rem', color: '#8aabdf' }}>{unitW}萬/坪</div>}
                    <div style={{ width: '100%', height: `${pct}px`, background: '#2a5298', borderRadius: '3px 3px 0 0', opacity: .7 + 0.3 * (pct / 95) }} />
                    <div style={{ fontSize: '.7rem', color: '#888', fontWeight: 500 }}>{r.year}</div>
                    <div style={{ fontSize: '.62rem', color: '#ccc' }}>{Number(r.n).toLocaleString()}筆</div>
                  </div>
                );
              })}
            </div>
            {yearTrend.length >= 2 && (() => {
              const first = yearTrend[0], last = yearTrend[yearTrend.length - 1];
              if (!first?.avg_price || !last?.avg_price) return null;
              const change = Math.round((Number(last.avg_price) - Number(first.avg_price)) / Number(first.avg_price) * 100);
              const years = Number(last.year) - Number(first.year);
              return years > 0 ? (
                <div style={{ padding: '.5rem 1rem .75rem', borderTop: '1px solid #f0f5ff', fontSize: '.78rem', color: '#666' }}>
                  {first.year}～{last.year} 年間，{d}{t}均價
                  <strong style={{ color: change >= 0 ? '#c2632a' : '#3a7d2c', margin: '0 4px' }}>
                    {change >= 0 ? `上漲 ${change}%` : `下跌 ${Math.abs(change)}%`}
                  </strong>（{years} 年）
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* 排序 + 筆數 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          {[{ label: '依成交日期', val: 'date' }, { label: '依總價 ↓', val: 'price' }].map(s => (
            <a key={s.val} href={q({ sort: s.val, page: 1 })}
              style={{ padding: '.28rem .75rem', fontSize: '.78rem', border: '1px solid', textDecoration: 'none', transition: 'all .15s',
                background: sort === s.val ? '#2a5298' : '#fff',
                color: sort === s.val ? '#fff' : '#888',
                borderColor: sort === s.val ? '#2a5298' : '#e0e8f8' }}>
              {s.label}
            </a>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '.78rem', color: '#aaa' }}>
            共 {totalCount.toLocaleString()} 筆 · 第 {page}/{totalPages || 1} 頁
          </span>
        </div>

        {/* 交易列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '1.5rem' }}>
          {records.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #ececec', padding: '3rem', textAlign: 'center', color: '#aaa' }}>
              此條件無成交記錄
            </div>
          ) : records.map((r: any) => {
            const priceWan = r.total_price ? Math.round(r.total_price / 10000) : null;
            const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
            const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
            return (
              <div key={r.id} className="tx-card">
                <div className="card-body">
                  <div className="card-addr">{r.address || '（地號）'}</div>
                  <div className="card-meta">
                    {areaPing && <span>建物 <strong style={{ color: '#555' }}>{areaPing}</strong> 坪</span>}
                    {r.bedrooms > 0 && <span>{r.bedrooms}房{r.halls}廳{r.bathrooms}衛</span>}
                    {r.floor && <span>{r.floor}</span>}
                    {r.total_floors && <span>共{r.total_floors}層</span>}
                    {r.elevator === '有' && <span style={{ color: '#3a7d2c' }}>電梯</span>}
                    {r.build_complete && <span>屋齡 {r.build_complete}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '.3rem' }}>
                    <div className="card-date">📅 成交日 {r.tx_date_iso || '—'}</div>
                    {r.address?.includes('號') && (() => {
                      const bAddr = r.address.substring(0, r.address.indexOf('號') + 1);
                      return (
                        <a href={`/community/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(bAddr)}`}
                          style={{ fontSize: '.68rem', color: '#2a5298', textDecoration: 'none', marginLeft: 'auto', padding: '.1rem .4rem', background: '#f0f5ff', borderRadius: 2 }}>
                          同棟記錄 →
                        </a>
                      );
                    })()}
                  </div>
                </div>
                <div className="price-col">
                  <div style={{ fontSize: 9.5, color: '#aaa', letterSpacing: '.06em' }}>成交總價</div>
                  <div className="price-val">{priceWan !== null ? <>{priceWan}<small>萬</small></> : '—'}</div>
                  {unitWan && <div className="price-unit">{unitWan} 萬/坪</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 分頁 */}
        {totalPages > 1 && (() => {
          const nums: (number | '…')[] = [];
          for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) nums.push(i);
            else if (nums[nums.length - 1] !== '…') nums.push('…');
          }
          return (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: '2rem' }}>
              {page > 1 ? <a href={q({ page: page - 1 })} className="page-btn">← 上一頁</a> : <span className="page-btn disabled">← 上一頁</span>}
              {nums.map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ color: '#ccc', padding: '0 4px' }}>…</span>
                : <a key={n} href={q({ page: n })} className={`page-btn${n === page ? ' active' : ''}`}>{n}</a>
              )}
              {page < totalPages ? <a href={q({ page: page + 1 })} className="page-btn">下一頁 →</a> : <span className="page-btn disabled">下一頁 →</span>}
            </div>
          );
        })()}

        {/* 同行政區其他類型 */}
        {otherTypes.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e0e8f8', padding: '1.1rem 1.25rem' }}>
            <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.88rem', fontWeight: 700, color: '#2a5298', marginBottom: '.85rem' }}>
              {d} 其他建物類型
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="type-chip">
                全部類型
              </a>
              {otherTypes.map((r: any) => (
                <a key={r.building_type}
                  href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.building_type)}`}
                  className="type-chip">
                  {r.building_type}
                  <span style={{ color: '#aaa', fontSize: '.7rem', marginLeft: 4 }}>({Number(r.n).toLocaleString()})</span>
                </a>
              ))}
            </div>
          </div>
        )}

      </main>
    </>
  );
}
