import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string; road: string }>;
type SearchParams = Promise<{ page?: string; sort?: string }>;

const sqmToPing           = (sqm: number) => sqm / 3.30579;
const unitSqmToWanPerPing = (u: number)   => (u * 3.30579) / 10000;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district, road } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const r = decodeURIComponent(road);

  let avg = 0, n = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n,
              AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit
       FROM lvr_land
       WHERE city='${c.replace(/'/g, "''")}' AND district='${d.replace(/'/g, "''")}' AND tx_type LIKE '%建物%'
         AND address LIKE '${r.replace(/'/g, "''").replace(/%/g, '\\%')}%'`
    );
    avg = rows[0]?.avg_unit ? Math.round(unitSqmToWanPerPing(Number(rows[0].avg_unit)) * 10) / 10 : 0;
    n   = Number(rows[0]?.n || 0);
  } catch { /* ignore */ }

  return {
    title: `${r}實價登錄 | ${c}${d}路段成交行情`,
    description: `${c}${d}${r}沿線房屋實際成交資料，共 ${n} 筆${avg ? `，每坪均價約 ${avg} 萬` : ''}。查看${r}歷年成交記錄與價格走勢。`,
    alternates: { canonical: `/price/${city}/${district}/road/${road}` },
  };
}

export default async function PriceRoadPage({
  params, searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { city, district, road } = await params;
  const sp = await searchParams;

  const c  = decodeURIComponent(city);
  const d  = decodeURIComponent(district);
  const rn = decodeURIComponent(road);

  const page     = Math.max(1, parseInt(sp.page || '1', 10));
  const sort     = sp.sort || 'date';
  const pageSize = 30;

  const safeC  = c.replace(/'/g, "''");
  const safeD  = d.replace(/'/g, "''");
  const safeRn = rn.replace(/'/g, "''");
  const addrLike = `${safeRn}%`;

  const orderBy = sort === 'price'
    ? `CASE WHEN total_price=0 THEN 1 ELSE 0 END, total_price DESC`
    : `CASE WHEN tx_date_iso='' THEN 1 ELSE 0 END, tx_date_iso DESC`;

  const baseWhere = `city='${safeC}' AND district='${safeD}' AND tx_type LIKE '%建物%' AND address LIKE '${addrLike}'`;

  let records: any[] = [], totalCount = 0, stats: any = null, yearTrend: any[] = [], bldStats: any[] = [];

  try {
    const [fetched, countRows, statsRows, trendRows, bldRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM lvr_land WHERE ${baseWhere} AND total_price > 0 ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      ),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as n FROM lvr_land WHERE ${baseWhere} AND total_price > 0`),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as n,
                AVG(CASE WHEN total_price > 0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                MAX(CASE WHEN total_price > 0 THEN total_price END) as max_p,
                MIN(CASE WHEN total_price > 0 THEN total_price END) as min_p,
                MAX(tx_date_iso) as latest
         FROM lvr_land WHERE ${baseWhere}`,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT SUBSTRING(tx_date_iso,1,4) as year,
                COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land WHERE ${baseWhere} AND total_price > 0 AND tx_date_iso IS NOT NULL
         GROUP BY SUBSTRING(tx_date_iso, 1, 4) HAVING SUBSTRING(tx_date_iso, 1, 4) >= '2020' ORDER BY 1`,
      ),
      // 路段內各建物類型分布
      prisma.$queryRawUnsafe<any[]>(
        `SELECT building_type, COUNT(*) as n,
                AVG(CASE WHEN total_price>0 THEN total_price END) as avg,
                AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
         FROM lvr_land WHERE ${baseWhere}
           AND building_type IS NOT NULL AND building_type != ''
         GROUP BY building_type ORDER BY n DESC`,
      ),
    ]);

    if (!statsRows[0] || Number(statsRows[0].n) === 0) notFound();
    records    = fetched;
    totalCount = Number(countRows[0].n);
    stats      = statsRows[0];
    yearTrend  = trendRows;
    bldStats   = bldRows;
  } catch (e: any) {
    if (e?.message?.includes('no such table')) notFound();
    throw e;
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const avgWan     = stats.avg ? Math.round(Number(stats.avg) / 10000) : null;
  const avgUnit    = stats.avg_unit ? unitSqmToWanPerPing(Number(stats.avg_unit)) : null;
  const maxAvg     = yearTrend.length ? Math.max(...yearTrend.map((r: any) => Number(r.avg_price || 0))) : 1;

  const q = (overrides: Record<string, string | number | undefined>) => {
    const base: Record<string, string | number | undefined> = { page, sort };
    const merged = { ...base, ...overrides };
    const pairs = Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined);
    const qs = pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return `/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/road/${encodeURIComponent(rn)}${qs ? '?' + qs : ''}`;
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
        .site-logo span { font-size: .72rem; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; border-radius: 2px; }
        .nav-link:hover { color: #c2632a; background: #fff8f4; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .tx-card { background: #fff; border: 1px solid #ececec; display: grid; grid-template-columns: 1fr auto; }
        .card-body { padding: .85rem 1rem; min-width: 0; }
        .card-addr { font-family: 'Noto Serif TC', serif; font-size: .88rem; font-weight: 500; color: #333; line-height: 1.6; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-bottom: .3rem; }
        .card-meta { display: flex; flex-wrap: wrap; gap: .4rem 1rem; font-size: .75rem; color: #999; }
        .card-date { font-size: .72rem; color: #bbb; margin-top: .4rem; }
        .price-col { padding: .85rem 1.1rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #f0f5ff; min-width: 100px; flex-shrink: 0; gap: .25rem; }
        .price-val { font-family: 'Noto Serif TC', serif; font-size: 1.3rem; font-weight: 700; color: #2a5298; }
        .price-val small { font-size: .68rem; color: #2a5298; margin-left: 2px; }
        .page-btn { display: inline-block; padding: .42rem .85rem; font-size: .8rem; color: #888; background: #fff; border: 1px solid #e0e8f8; text-decoration: none; }
        .page-btn:hover { border-color: #2a5298; color: #2a5298; }
        .page-btn.active { background: #2a5298; color: #fff; border-color: #2a5298; }
        .page-btn.disabled { color: #ddd; border-color: #f0f0f0; pointer-events: none; }
        @media(max-width:640px) { .price-col { display: none; } }
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

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11, flexWrap: 'wrap' }}>
          <a href="/" className="crumb">首頁</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href="/price" className="crumb">實價登錄</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}`} className="crumb">{c}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`} className="crumb">{d}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#2a5298', fontWeight: 500 }}>{rn}</span>
        </nav>

        {/* Hero */}
        <div style={{ background: '#fff', borderTop: '3px solid #2a5298', padding: 'clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.18em', color: '#2a5298', marginBottom: '.5rem' }}>路段實價登錄</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.85rem)', fontWeight: 700, color: '#1e3a6e', lineHeight: 1.5, marginBottom: '.6rem' }}>
            {rn} 實價登錄
          </h1>
          <p style={{ fontSize: '.88rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            {c}{d}{rn}沿線共 <strong style={{ color: '#2a5298' }}>{totalCount.toLocaleString()}</strong> 筆成交
            {avgWan && <>，成交均價 <strong style={{ color: '#2a5298' }}>{avgWan.toLocaleString()} 萬</strong></>}
            {avgUnit && <>，每坪均價 <strong style={{ color: '#2a5298' }}>{avgUnit.toFixed(1)} 萬</strong></>}。
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
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>{rn} 歷年成交走勢</span>
              <span style={{ fontSize: '.72rem', color: '#8aabdf' }}>{yearTrend[0]?.year}～{yearTrend[yearTrend.length-1]?.year}</span>
            </div>
            <div style={{ padding: '1rem 1rem .75rem', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 110 }}>
              {yearTrend.map((r: any) => {
                const avgW = r.avg_price ? Math.round(Number(r.avg_price) / 10000) : null;
                const unitW = r.avg_unit ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                const pct = r.avg_price ? Math.round((Number(r.avg_price) / maxAvg) * 85) + 10 : 10;
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: '.68rem', color: '#2a5298', fontWeight: 600 }}>{avgW ? `${avgW.toLocaleString()}萬` : '—'}</div>
                    {unitW && <div style={{ fontSize: '.62rem', color: '#8aabdf' }}>{unitW}/坪</div>}
                    <div style={{ width: '100%', height: `${pct}px`, background: '#2a5298', borderRadius: '3px 3px 0 0', opacity: .7 + 0.3 * (pct / 95) }} />
                    <div style={{ fontSize: '.7rem', color: '#888', fontWeight: 500 }}>{r.year}</div>
                    <div style={{ fontSize: '.62rem', color: '#ccc' }}>{Number(r.n)}筆</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 路段內建物類型分布 */}
        {bldStats.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e0e8f8', marginBottom: '1rem', overflow: 'hidden' }}>
            <div style={{ background: '#f0f5ff', padding: '.6rem 1rem', borderBottom: '1px solid #e0e8f8' }}>
              <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#2a5298' }}>路段內建物類型分布</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 1, background: '#e0e8f8' }}>
              {bldStats.map((r: any) => {
                const avgW  = r.avg ? Math.round(Number(r.avg) / 10000) : null;
                const unitW = r.avg_unit ? unitSqmToWanPerPing(Number(r.avg_unit)).toFixed(1) : null;
                return (
                  <a key={r.building_type}
                    href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(r.building_type)}`}
                    style={{ background: '#fff', padding: '.8rem 1rem', textDecoration: 'none', display: 'block' }}>
                    <div style={{ fontSize: '.75rem', color: '#2a5298', fontWeight: 600 }}>
                      {r.building_type}<span style={{ color: '#aaa', fontWeight: 300, marginLeft: 4 }}>({Number(r.n)}筆)</span>
                    </div>
                    <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700, color: '#1e3a6e', marginTop: '.2rem' }}>
                      {avgW ? `${avgW.toLocaleString()} 萬` : '—'}
                    </div>
                    {unitW && <div style={{ fontSize: '.7rem', color: '#8aabdf' }}>{unitW} 萬/坪</div>}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* 排序 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          {[{ label: '依成交日期', val: 'date' }, { label: '依總價 ↓', val: 'price' }].map(s => (
            <a key={s.val} href={q({ sort: s.val, page: 1 })}
              style={{ padding: '.28rem .75rem', fontSize: '.78rem', border: '1px solid', textDecoration: 'none',
                background: sort === s.val ? '#2a5298' : '#fff', color: sort === s.val ? '#fff' : '#888',
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
          {records.map((r: any) => {
            const priceWan = r.total_price ? Math.round(r.total_price / 10000) : null;
            const areaPing = r.area_sqm ? sqmToPing(Number(r.area_sqm)).toFixed(1) : null;
            const unitWan  = r.unit_price_sqm ? unitSqmToWanPerPing(Number(r.unit_price_sqm)).toFixed(1) : null;
            return (
              <div key={r.id} className="tx-card">
                <div className="card-body">
                  <div className="card-addr">{r.address}</div>
                  <div className="card-meta">
                    {r.building_type && <span style={{ color: '#2a5298' }}>{r.building_type}</span>}
                    {areaPing && <span>建物 <strong style={{ color: '#555' }}>{areaPing}</strong> 坪</span>}
                    {r.bedrooms > 0 && <span>{r.bedrooms}房{r.halls}廳{r.bathrooms}衛</span>}
                    {r.floor && <span>{r.floor}</span>}
                    {r.elevator === '有' && <span style={{ color: '#3a7d2c' }}>電梯</span>}
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
                  {unitWan && <div style={{ fontSize: '.75rem', color: '#aaa' }}>{unitWan} 萬/坪</div>}
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

        {/* 返回行政區 */}
        <div style={{ textAlign: 'center' }}>
          <a href={`/price/${encodeURIComponent(c)}/${encodeURIComponent(d)}`}
            style={{ display: 'inline-block', padding: '.55rem 1.5rem', background: '#f0f5ff', color: '#2a5298', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none', border: '1px solid #b8d0f0' }}>
            ← {d} 全區行情
          </a>
        </div>

      </main>
    </>
  );
}
