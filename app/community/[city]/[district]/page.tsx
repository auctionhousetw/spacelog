import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

type Params = Promise<{ city: string; district: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  return {
    title: `${c}${d}社區大樓查詢 | 實價登錄歷年成交`,
    description: `${c}${d}社區大樓、華廈、公寓名稱列表。收錄管委會、實價登錄、好房網等來源，點選社區可查歷年成交記錄與法拍資訊。`,
    alternates: { canonical: `/community/${city}/${district}` },
  };
}

export default async function CommunityDistrictPage({ params }: { params: Params }) {
  const { city, district } = await params;
  const c = decodeURIComponent(city);
  const d = decodeURIComponent(district);
  const safeC = c.replace(/'/g, "''");
  const safeD = d.replace(/'/g, "''");

  let rows: any[] = [];
  try {
    rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT name, addr, tx_count, source
      FROM community_names
      WHERE city='${safeC}' AND district='${safeD}'
        AND district != ''
        AND LENGTH(district) BETWEEN 2 AND 4
        AND district ~ '[區鎮鄉市]$'
        AND (LENGTH(district) < 4 OR district !~ '[區鎮鄉市][區鎮鄉市]$')
      ORDER BY COALESCE(tx_count, 0) DESC, name ASC
      LIMIT 2000
    `);
    if (!rows.length) notFound();
  } catch { notFound(); }

  const withData  = rows.filter(r => Number(r.tx_count || 0) > 0).length;
  const govRows   = rows.filter(r => r.source === 'gov_committee').length;

  // 用代表門牌去掉縣市+行政區前綴，保留路名以後
  const stripAddrPrefix = (addr: string) => {
    if (!addr) return '';
    let s = addr;
    for (const cv of [c, c.replace(/^台/, '臺'), c.replace(/^臺/, '台')]) {
      if (s.startsWith(cv)) { s = s.slice(cv.length); break; }
    }
    if (s.startsWith(d)) s = s.slice(d.length);
    return s;
  };

  const communities = rows.map(r => ({
    name: r.name as string,
    addr: stripAddrPrefix((r.addr as string) || ''),
    txCount: Number(r.tx_count || 0),
    source: r.source as string,
  }));

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', 'PingFang TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: #2a5298; }
        .search-box { width: 100%; padding: .65rem .9rem; border: 1px solid #ddd; border-radius: 4px; font-size: .88rem; outline: none; }
        .search-box:focus { border-color: #2a5298; }
        .c-card { display: flex; align-items: center; padding: .7rem 1rem; text-decoration: none; color: inherit; border-bottom: 1px solid #f0f0f0; transition: background .1s; }
        .c-card:hover { background: #f5f8ff; }
        .c-name { font-size: .9rem; font-weight: 600; color: #1e3a6e; flex: 1; min-width: 0; }
        .c-addr { font-size: .72rem; color: #aaa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
        .tx-badge { font-size: .65rem; background: #e8f4e8; color: #2a6a2a; border: 1px solid #b8ddb8; border-radius: 2px; padding: 1px 5px; white-space: nowrap; margin-left: .5rem; }
        .gov-badge { font-size: .65rem; background: #fff8e1; color: #9a6a00; border: 1px solid #ffe082; border-radius: 2px; padding: 1px 5px; margin-left: .3rem; }
        .no-data { color: #ccc; font-size: .72rem; margin-left: .5rem; }
        #count-label { font-size: .8rem; color: #888; margin-bottom: .5rem; }
        .hidden { display: none !important; }
      `}</style>

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋資訊平台</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/price" className="nav-link">實價登錄</a>
          <a href="/community" className="nav-link" style={{ color: '#2a5298' }}>社區大樓</a>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem) 5rem' }}>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11, flexWrap: 'wrap' }}>
          <a href="/" className="crumb">首頁</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href="/community" className="crumb">社區大樓</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <a href={`/community/${encodeURIComponent(c)}`} className="crumb">{c}</a>
          <span style={{ color: '#e0e0e0' }}>›</span>
          <span style={{ color: '#444', fontWeight: 500 }}>{d}</span>
        </nav>

        <div style={{ background: '#fff', borderTop: '4px solid #2a5298', padding: 'clamp(1rem,4vw,1.75rem)', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '.72rem', fontWeight: 500, letterSpacing: '.2em', color: '#2a5298', marginBottom: '.4rem' }}>
            COMMUNITY SEARCH · 社區大樓
          </p>
          <h1 style={{ fontSize: 'clamp(1.2rem,3.5vw,1.6rem)', fontWeight: 700, color: '#1e3a6e', marginBottom: '.6rem' }}>
            {c}{d}社區大樓查詢
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.8rem', color: '#888' }}>
            <span>共 <strong style={{ color: '#2a5298' }}>{rows.length.toLocaleString()}</strong> 個社區</span>
            <span>有成交記錄 <strong style={{ color: '#2a6a2a' }}>{withData.toLocaleString()}</strong> 個</span>
            {govRows > 0 && <span>管委會資料 <strong style={{ color: '#9a6a00' }}>{govRows.toLocaleString()}</strong> 個</span>}
          </div>
        </div>

        <div style={{ marginBottom: '.75rem' }}>
          <input
            type="search"
            id="community-search"
            className="search-box"
            placeholder={`搜尋 ${d} 社區名稱...`}
            aria-label="搜尋社區名稱"
            autoComplete="off"
          />
        </div>
        <div id="count-label">顯示 {rows.length.toLocaleString()} 個社區</div>

        <div id="community-list" style={{ background: '#fff', border: '1px solid #ececec' }}>
          {communities.map((com, i) => (
            <a
              key={i}
              href={`/community/${encodeURIComponent(c)}/${encodeURIComponent(d)}/${encodeURIComponent(com.name)}`}
              className="c-card"
              data-name={com.name}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="c-name">{com.name}</div>
                {com.addr && <div className="c-addr">{com.addr}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {com.txCount > 0
                  ? <span className="tx-badge">{com.txCount} 筆成交</span>
                  : <span className="no-data">暫無成交記錄</span>
                }
                {com.source === 'gov_committee' && <span className="gov-badge">管委會</span>}
              </div>
            </a>
          ))}
        </div>

        <div id="no-result" className="hidden" style={{ padding: '2rem 1rem', textAlign: 'center', color: '#aaa', fontSize: '.88rem', background: '#fff', border: '1px solid #ececec' }}>
          找不到符合的社區名稱
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: '#f9f9f8', border: '1px solid #ececec', fontSize: '.8rem', color: '#888', lineHeight: 1.9 }}>
          資料來源：政府管委會公開資料（標示「管委會」）、實價登錄、好房網、591 等平台整合。
          點選社區可查詢歷年成交走勢、各層成交記錄與法拍資訊。
        </div>

      </main>

      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var input = document.getElementById('community-search');
          var list  = document.getElementById('community-list');
          var noRes = document.getElementById('no-result');
          var label = document.getElementById('count-label');
          if (!input) return;
          input.addEventListener('input', function() {
            var q = this.value.trim().toLowerCase();
            var cards = list.querySelectorAll('.c-card');
            var visible = 0;
            cards.forEach(function(card) {
              var name = (card.getAttribute('data-name') || '').toLowerCase();
              if (!q || name.indexOf(q) !== -1) {
                card.classList.remove('hidden');
                visible++;
              } else {
                card.classList.add('hidden');
              }
            });
            label.textContent = q
              ? ('搜尋結果：' + visible + ' 個社區')
              : ('顯示 ${rows.length.toLocaleString()} 個社區');
            if (q && visible === 0) {
              noRes.classList.remove('hidden');
              list.style.display = 'none';
            } else {
              noRes.classList.add('hidden');
              list.style.display = '';
            }
          });
        })();
      `}} />
    </>
  );
}
