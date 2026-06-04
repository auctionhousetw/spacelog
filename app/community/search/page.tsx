import { redirect } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type SearchParams = Promise<{ q?: string }>;

export function generateMetadata() {
  return { title: '地址搜尋 | 查歷年成交記錄', robots: { index: false } };
}

export default async function CommunitySearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = '' } = await searchParams;
  const keyword = q.trim();

  let results: { city: string; district: string; addr: string; n: number }[] = [];

  if (keyword) {
    try {
      results = await prisma.$queryRawUnsafe<{ city: string; district: string; addr: string; n: bigint }[]>(
        `SELECT city, district,
                CASE WHEN instr(address,'號') > 0
                     THEN substr(address,1,instr(address,'號'))
                     ELSE address END as addr,
                COUNT(*) as n
         FROM lvr_land
         WHERE address LIKE ? AND tx_type LIKE '%建物%' AND total_price > 0
           AND city IS NOT NULL AND district IS NOT NULL
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district, addr
         HAVING addr IS NOT NULL AND addr != ''
         ORDER BY n DESC
         LIMIT 30`,
        `%${keyword}%`
      ).then(rows => rows.map(r => ({ ...r, n: Number(r.n) })));

      // 完全匹配或只有一筆時直接跳轉
      if (results.length === 1) {
        const r = results[0];
        redirect(`/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.addr)}`);
      }
    } catch { /* DB 未就緒 */ }
  }

  const BASE = process.env.NEXT_PUBLIC_BASE_URL || '';

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
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: 1rem; font-weight: 700; color: #2a5298; border-left: 4px solid #2a5298; padding: .6rem 1rem; background: #f0f5ff; margin-bottom: 1rem; }
        .result-list { display: flex; flex-direction: column; gap: 6px; }
        .result-item { background: #fff; border: 1px solid #ececec; padding: .85rem 1.1rem; text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between; transition: box-shadow .15s; }
        .result-item:hover { box-shadow: 0 2px 10px rgba(0,0,0,.07); border-color: #b8d0f0; }
        .result-addr { font-size: .9rem; color: #333; }
        .result-addr em { color: #2a5298; font-style: normal; font-weight: 500; }
        .result-meta { font-size: .75rem; color: #aaa; margin-top: .2rem; }
        .result-n { font-size: .78rem; color: #2a5298; font-weight: 500; white-space: nowrap; margin-left: 1rem; }
        .empty { padding: 2.5rem; text-align: center; color: #aaa; font-size: .9rem; background: #fff; border: 1px solid #ececec; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link">實價登錄</a>
        </div>
      </header>

      <div className="wrap">
        <form method="get" action="/community/search" className="search-bar">
          <input name="q" defaultValue={keyword} placeholder="輸入地址查歷年成交，如：台北市大安區仁愛路一段" />
          <button type="submit">查歷年成交</button>
        </form>

        {!keyword ? (
          <div className="empty">請輸入地址關鍵字查詢</div>
        ) : results.length === 0 ? (
          <div className="empty">
            找不到「{keyword}」的成交記錄。<br />
            <span style={{ fontSize: '.82rem', marginTop: '.5rem', display: 'block' }}>
              可嘗試縮短關鍵字，例如只輸入路名。
            </span>
          </div>
        ) : (
          <>
            <div className="sec-head">
              「{keyword}」共找到 {results.length} 筆地址
            </div>
            <div className="result-list">
              {results.map((r, i) => {
                const href = `/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.addr)}`;
                const addrHl = r.addr.replace(
                  new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                  `<em>${keyword}</em>`
                );
                return (
                  <a key={i} href={href} className="result-item">
                    <div>
                      <div className="result-addr" dangerouslySetInnerHTML={{ __html: `${r.city}${r.district}${addrHl}` }} />
                      <div className="result-meta">{r.city} · {r.district}</div>
                    </div>
                    <div className="result-n">{r.n} 筆成交</div>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
