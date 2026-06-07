import { redirect } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type SearchParams = Promise<{ q?: string }>;

export function generateMetadata() {
  return { title: '地址 / 建案搜尋 | 查歷年成交記錄', robots: { index: false } };
}

export default async function CommunitySearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = '' } = await searchParams;
  const keyword = q.trim();

  let addrResults: { city: string; district: string; addr: string; n: number }[] = [];
  let projectResults: { city: string; district: string; project_name: string; n: number; avg_price: number | null }[] = [];

  if (keyword) {
    try {
      const [addrRows, projectRows] = await Promise.all([
        prisma.$queryRawUnsafe<{ city: string; district: string; addr: string; n: bigint }[]>(
          `SELECT city, district,
                  CASE WHEN STRPOS(address,'號') > 0
                       THEN SUBSTRING(address,1,STRPOS(address,'號'))
                       ELSE address END as addr,
                  COUNT(*) as n
           FROM lvr_land
           WHERE address LIKE $1 AND tx_type LIKE '%建物%' AND total_price > 0
             AND city IS NOT NULL AND district IS NOT NULL
             AND address IS NOT NULL AND address != ''
           GROUP BY city, district,
                    CASE WHEN STRPOS(address,'號') > 0
                         THEN SUBSTRING(address,1,STRPOS(address,'號'))
                         ELSE address END
           ORDER BY n DESC
           LIMIT 20`,
          `%${keyword}%`
        ).then(rows => rows.map(r => ({ ...r, n: Number(r.n) }))),

        prisma.$queryRawUnsafe<{ city: string; district: string; project_name: string; n: bigint; avg_price: number | null }[]>(
          `SELECT city, district, project_name, COUNT(*) as n,
                  AVG(CASE WHEN total_price>0 THEN total_price END) as avg_price
           FROM lvr_presale
           WHERE project_name LIKE $1
             AND project_name IS NOT NULL AND project_name != ''
             AND city IS NOT NULL AND district IS NOT NULL
           GROUP BY city, district, project_name
           ORDER BY n DESC
           LIMIT 15`,
          `%${keyword}%`
        ).then(rows => rows.map(r => ({ ...r, n: Number(r.n), avg_price: r.avg_price ? Number(r.avg_price) : null }))),
      ]);

      addrResults    = addrRows;
      projectResults = projectRows;

      // 唯一結果時直接跳轉
      const totalResults = addrResults.length + projectResults.length;
      if (totalResults === 1) {
        if (addrResults.length === 1) {
          const r = addrResults[0];
          redirect(`/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.addr)}`);
        }
        if (projectResults.length === 1) {
          const r = projectResults[0];
          redirect(`/presale/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.project_name)}`);
        }
      }
    } catch { /* DB 未就緒 */ }
  }

  const hasResults = addrResults.length > 0 || projectResults.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .site-logo span { font-size: .72rem; font-weight: 400; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .wrap { max-width: 900px; margin: 2rem auto; padding: 0 clamp(1rem,3vw,2rem); }
        .search-bar { display: flex; gap: 0; margin-bottom: 1.5rem; box-shadow: 0 2px 12px rgba(0,0,0,.08); border-radius: 2px; }
        .search-bar input { flex: 1; padding: .75rem 1rem; font-size: .9rem; border: 1px solid #ddd; border-right: none; border-radius: 2px 0 0 2px; outline: none; font-family: inherit; }
        .search-bar button { padding: .75rem 1.25rem; background: #2a5298; color: #fff; border: none; border-radius: 0 2px 2px 0; font-family: inherit; font-size: .88rem; font-weight: 500; cursor: pointer; white-space: nowrap; }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .55rem 1rem; background: #f0f5ff; margin: 1.25rem 0 .65rem; }
        .sec-head.green { color: #1a6b3a; border-left-color: #1a6b3a; background: #f0fdf4; }
        .result-list { display: flex; flex-direction: column; gap: 4px; }
        .result-item { background: #fff; border: 1px solid #ececec; padding: .85rem 1.1rem; text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between; }
        .result-item:hover { border-color: #b8d0f0; background: #fafbff; }
        .result-item.green:hover { border-color: #a8dab8; background: #f8fef8; }
        .result-addr { font-size: .88rem; color: #333; }
        .result-addr em { color: #2a5298; font-style: normal; font-weight: 600; }
        .result-addr em.green { color: #1a6b3a; }
        .result-meta { font-size: .72rem; color: #aaa; margin-top: .2rem; }
        .result-right { text-align: right; margin-left: 1rem; flex-shrink: 0; }
        .result-n { font-size: .78rem; color: #2a5298; font-weight: 600; }
        .result-n.green { color: #1a6b3a; }
        .result-avg { font-size: .68rem; color: #bbb; margin-top: .15rem; }
        .empty { padding: 2.5rem; text-align: center; color: #aaa; font-size: .9rem; background: #fff; border: 1px solid #ececec; }
        .hint { font-size: .78rem; color: #aaa; margin-bottom: 1.5rem; line-height: 1.8; }
        .hint strong { color: #555; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link">實價登錄</a>
          <a href="/presale" className="nav-link">預售屋</a>
          <a href="/compare" className="nav-link" style={{ color: '#2a5298' }}>比較</a>
        </div>
      </header>

      <div className="wrap">
        <form method="get" action="/community/search" className="search-bar">
          <input name="q" defaultValue={keyword} placeholder="輸入地址或建案名稱，如：仁愛路、都廳大院" autoFocus />
          <button type="submit">搜尋</button>
        </form>

        {!keyword ? (
          <>
            <p className="hint">
              支援兩種搜尋方式：<br />
              <strong>地址搜尋</strong>：輸入路名或門牌號，查詢該地址的歷年實價成交記錄<br />
              <strong>建案名稱</strong>：輸入建案/社區名稱，查詢預售成交記錄與行情
            </p>
            <div className="empty">請輸入地址或建案名稱查詢</div>
          </>
        ) : !hasResults ? (
          <div className="empty">
            找不到「{keyword}」的相關記錄。<br />
            <span style={{ fontSize: '.82rem', marginTop: '.5rem', display: 'block' }}>
              可嘗試縮短關鍵字，例如只輸入路名或建案名稱部分字。
            </span>
          </div>
        ) : (
          <>
            {/* 建案名稱結果 */}
            {projectResults.length > 0 && (
              <>
                <div className="sec-head green">建案名稱（{projectResults.length} 筆）</div>
                <div className="result-list">
                  {projectResults.map((r, i) => {
                    const href = `/presale/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.project_name)}`;
                    const nameHl = r.project_name.replace(
                      new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                      `<em class="green">${keyword}</em>`
                    );
                    const avgWan = r.avg_price ? Math.round(r.avg_price / 10000) : null;
                    return (
                      <a key={i} href={href} className="result-item green">
                        <div>
                          <div className="result-addr" dangerouslySetInnerHTML={{ __html: nameHl }} />
                          <div className="result-meta">{r.city} · {r.district} · 預售成交</div>
                        </div>
                        <div className="result-right">
                          <div className="result-n green">{r.n} 筆</div>
                          {avgWan && <div className="result-avg">均價 {avgWan.toLocaleString()} 萬</div>}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </>
            )}

            {/* 地址結果 */}
            {addrResults.length > 0 && (
              <>
                <div className="sec-head">地址（{addrResults.length} 筆）</div>
                <div className="result-list">
                  {addrResults.map((r, i) => {
                    const href = `/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.addr)}`;
                    const addrHl = r.addr.replace(
                      new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                      `<em>${keyword}</em>`
                    );
                    return (
                      <a key={i} href={href} className="result-item">
                        <div>
                          <div className="result-addr" dangerouslySetInnerHTML={{ __html: `${r.city}${r.district}${addrHl}` }} />
                          <div className="result-meta">{r.city} · {r.district} · 實價成屋</div>
                        </div>
                        <div className="result-right">
                          <div className="result-n">{r.n} 筆</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
