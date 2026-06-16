import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

export const revalidate = 86400;

type Params = Promise<{ city: string; period: string }>;

const PERIOD_MAP: Record<string, {
  city: string;
  name: string;
  districts: string[];
  segments?: string[];   // 若有精確段名則用 JOIN 過濾，否則退回行政區
  area: string;
  completedYear: string;
  description: string;
}> = {
  '台中-1期':  { city: '台中市', name: '大智重劃區',      districts: ['東區'],                     segments: ['大智段'], area: '14.53',  completedYear: '1967', description: '台中市第一期市地重劃，位於東區大智路一帶，為台灣戰後最早完成的市地重劃案例之一，成功示範促使政府持續推動後續各期。' },
  '台中-2期':  { city: '台中市', name: '麻園頭重劃區',    districts: ['西區'],                     segments: ['麻園頭段'], area: '24.26',  completedYear: '1971', description: '位於台中市西區，麻園頭地區農地整理重劃，改善地籍零亂問題，建立整齊道路與公共設施。' },
  '台中-3期':  { city: '台中市', name: '忠明重劃區',      districts: ['西區'],                     area: '18.65',  completedYear: '1975', description: '忠明南路一帶，台中市西區歷史重劃區，帶動周邊商業發展。' },
  '台中-4期':  { city: '台中市', name: '中正東山重劃區',  districts: ['北區', '北屯區', '西屯區'],  segments: ['中正段','東山段'], area: '440.66', completedYear: '1980', description: '跨越北區、北屯區、西屯區，面積達 440 公頃，為台中早期規模最大的市地重劃之一，奠定台中北部發展基礎。' },
  '台中-5期':  { city: '台中市', name: '大墩重劃區',      districts: ['南屯區', '西屯區', '西區'],  segments: ['大墩段'], area: '228.31', completedYear: '1985', description: '跨南屯區、西屯區及西區，以大墩路為核心，東接精明一街商圈，北鄰七期惠來重劃區，區內公益路、大隆路等商圈成熟。' },
  '台中-6期':  { city: '台中市', name: '干城重劃區',      districts: ['東區'],                     area: '19.43',  completedYear: '1990', description: '位於台中車站東北側，干城地區小型重劃，緊鄰台鐵台中站，周邊以商業住宅為主。' },
  '台中-7期':  { city: '台中市', name: '惠來重劃區',      districts: ['西屯區', '南屯區'],          segments: ['惠仁段','惠義段','惠禮段','惠智段','惠信段','惠國段','惠泰段','惠民段','惠安段','惠順段','惠來厝段'], area: '353.40', completedYear: '1992', description: '台中七期（惠來重劃區），現為台中市中央商務區（CBD）核心，台灣大道橫貫其中，集結頂級百貨、辦公商廈與高檔住宅，是台中房價最高的重劃區之一。範圍以台灣大道為軸，東起文心路，西至環中路，南迄大墩街，北達寧夏路，面積 353 公頃。' },
  '台中-8期':  { city: '台中市', name: '豐樂重劃區',      districts: ['南屯區'],                   segments: ['豐樂段'], area: '148.80', completedYear: '1991', description: '位於南屯區豐樂路一帶，豐樂公園為區內重要綠地，緊鄰七期惠來重劃區南側，為台中市中部重要的住宅重劃區。' },
  '台中-9期':  { city: '台中市', name: '旱溪重劃區',      districts: ['東區'],                     segments: ['旱溪段'], area: '120.53', completedYear: '1994', description: '位於東區旱溪東側，早期為工廠、農地混雜地帶，透過重劃整理地籍，建立完整道路系統，現以住宅為主。' },
  '台中-10期': { city: '台中市', name: '軍功水景重劃區',  districts: ['北屯區'],                   segments: ['軍福段','軍和段'], area: '221.20', completedYear: '2000', description: '台中十期，位於北屯區軍功路、水景里一帶，緊鄰大坑風景區，2000年完成重劃，是台中北屯區重要的住宅聚落，周邊配套設施完善。' },
  '台中-11期': { city: '台中市', name: '四張犁重劃區',    districts: ['北屯區'],                   area: '141.02', completedYear: '1997', description: '位於北屯區四張犁，台中十一期重劃區，鄰近松竹路商圈，提供大量住宅用地，為十四期開發前北屯最重要的住宅區之一。' },
  '台中-12期': { city: '台中市', name: '福星重劃區',      districts: ['西屯區'],                   segments: ['福星段'], area: '81.05',  completedYear: '2008', description: '西屯區福星路一帶，十二期重劃區緊鄰中科（中部科學工業園區）南側，具備科技產業帶動的購屋需求。' },
  '台中-13期': { city: '台中市', name: '大慶重劃區',      districts: ['南區', '南屯區'],            segments: ['大慶段'], area: '229.57', completedYear: '2015', description: '跨南區與南屯區，台中火車站南側，大慶車站（捷運綠線）帶動開發，整合大量農地農舍，提供台中南區新興住宅與商業空間。' },
  '台中-14期': { city: '台中市', name: '美和庄重劃區',    districts: ['北屯區'],                   segments: ['仁平段','敦和段','榮德段','洲際段','環中段','美和段'], area: '403.39', completedYear: '2015', description: '台中十四期（美和庄重劃區），位於北屯區，面積 403 公頃，是台中市近 40 年來規模最大的重劃區。2007年開始辦理，2015年完成，預售市場熱絡，吸引大量建商進駐，捷運綠線松竹站通車後交通優勢更加明顯。' },
  '台中-15期': { city: '台中市', name: '大里杙重劃區',    districts: ['大里區'],                   segments: ['大里段'], area: '—',      completedYear: '進行中', description: '全國首例跨都市計畫區重劃案，位於大里區舊市區中心，改善大里舊市區地籍零亂問題。' },
  '台中-16期': { city: '台中市', name: '社皮重劃區',      districts: ['豐原區'],                   segments: ['豐社段'], area: '—',      completedYear: '完成',   description: '原臺中縣第七期市地重劃，位於豐原區社皮里，2010年台中縣市合併後統一編號為第十六期。' },
};

const toWanPerPing = (u: number) => +(((u * 3.30579) / 10000).toFixed(1));

export async function generateMetadata({ params }: { params: Params }) {
  const { city: cityEnc, period: periodEnc } = await params;
  const city   = decodeURIComponent(cityEnc);
  const period = decodeURIComponent(periodEnc);
  const data   = PERIOD_MAP[`${city}-${period}`];
  if (!data) return {};
  return {
    title: `${city}${period}重劃區（${data.name}）完整資訊`,
    description: `${city}${period}重劃區位於${data.districts.join('、')}。${data.description.slice(0, 80)}。查看本區法拍屋底價、預售建案均坪、實價登錄成交行情。`,
    alternates: { canonical: `/land-readjustment/${cityEnc}/${periodEnc}` },
  };
}

export default async function LandReadjustmentHubPage({ params }: { params: Params }) {
  const { city: cityEnc, period: periodEnc } = await params;
  const city   = decodeURIComponent(cityEnc);
  const period = decodeURIComponent(periodEnc);
  const data   = PERIOD_MAP[`${city}-${period}`];
  if (!data) notFound();

  const { name, districts, area, completedYear, description } = data;
  const dbCity    = data.city;
  const safeCity  = dbCity.replace(/'/g, "''");
  const distCond  = districts.map(d => `'${d.replace(/'/g, "''")}'`).join(',');
  const hasSegs   = !!data.segments?.length;
  const segCond   = data.segments?.map(s => `'${s.replace(/'/g, "''")}'`).join(',') ?? '';

  let auctions: any[] = [], presales: any[] = [], lvrStats: any[] = [], lvrRows: any[] = [];

  try {
    [auctions, presales, lvrStats, lvrRows] = await Promise.all([
      // 法拍：用行政區（法拍資料無地段資訊）
      prisma.$queryRawUnsafe<any[]>(`
        SELECT id, title, city, district, price, auction_date, category, floor
        FROM houses
        WHERE city='${safeCity}' AND district IN (${distCond})
        ORDER BY auction_date DESC NULLS LAST, id DESC LIMIT 8
      `).catch(() => []),
      // 預售：用行政區（預售資料無地段資訊）
      prismaLvr.$queryRawUnsafe<any[]>(`
        SELECT project_name, COUNT(*) as n,
               AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit,
               MAX(tx_date_iso) as last_date
        FROM lvr_presale
        WHERE city='${safeCity}' AND district IN (${distCond})
        GROUP BY project_name ORDER BY last_date DESC LIMIT 6
      `).catch(() => []),
      // 實價統計：有段名用精確段名 JOIN，否則用行政區
      hasSegs
        ? prismaLvr.$queryRawUnsafe<any[]>(`
            SELECT l.district, COUNT(*) as n,
                   AVG(CASE WHEN l.unit_price_sqm>0 THEN l.unit_price_sqm END) as avg_unit
            FROM lvr_land l
            JOIN lvr_land_section ls ON ls.tx_id = l.id
            WHERE l.city='${safeCity}' AND ls.segment_name IN (${segCond})
              AND l.tx_type LIKE '%建物%' AND l.total_price>0
              AND l.tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
            GROUP BY l.district
          `).catch(() => [])
        : prismaLvr.$queryRawUnsafe<any[]>(`
            SELECT district, COUNT(*) as n,
                   AVG(CASE WHEN unit_price_sqm>0 THEN unit_price_sqm END) as avg_unit
            FROM lvr_land
            WHERE city='${safeCity}' AND district IN (${distCond})
              AND tx_type LIKE '%建物%' AND total_price>0
              AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
            GROUP BY district
          `).catch(() => []),
      // 實價明細：有段名用精確段名 JOIN，否則用行政區
      hasSegs
        ? prismaLvr.$queryRawUnsafe<any[]>(`
            SELECT l.address, l.district, l.total_price, l.unit_price_sqm, l.area_sqm, l.tx_date_iso, l.floor, l.building_type
            FROM lvr_land l
            JOIN lvr_land_section ls ON ls.tx_id = l.id
            WHERE l.city='${safeCity}' AND ls.segment_name IN (${segCond})
              AND l.tx_type LIKE '%建物%' AND l.total_price>0
              AND l.tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
            ORDER BY l.tx_date_iso DESC LIMIT 6
          `).catch(() => [])
        : prismaLvr.$queryRawUnsafe<any[]>(`
            SELECT address, district, total_price, unit_price_sqm, area_sqm, tx_date_iso, floor, building_type
            FROM lvr_land
            WHERE city='${safeCity}' AND district IN (${distCond})
              AND tx_type LIKE '%建物%' AND total_price>0
              AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
            ORDER BY tx_date_iso DESC LIMIT 6
          `).catch(() => []),
    ]);
  } catch { /* ignore */ }

  const totalLvrN      = lvrStats.reduce((s: number, r: any) => s + Number(r.n), 0);
  const avgUnit        = lvrStats.length ? toWanPerPing(lvrStats.reduce((s: number, r: any) => s + Number(r.avg_unit || 0), 0) / lvrStats.length) : null;
  const auctionsWithPrice = auctions.filter((r: any) => Number(r.price) > 0);
  const avgAuction = auctionsWithPrice.length ? Math.round(auctionsWithPrice.reduce((s: number, r: any) => s + Number(r.price), 0) / auctionsWithPrice.length / 10000) : null;
  const avgPresaleUnit = presales.length  ? toWanPerPing(presales.reduce((s: number, r: any) => s + Number(r.avg_unit || 0), 0) / presales.length) : null;

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
        .crumb:hover { color: #7b5ea7; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .kpi4 { display: grid; grid-template-columns: repeat(4,1fr); background: #fff; border-bottom: 1px solid #ececec; }
        .kpi-cell { padding: 1rem 1.25rem; border-right: 1px solid #f0f0f0; }
        .kpi-cell:last-child { border-right: none; }
        .kpi-val { font-family: 'Noto Serif TC', serif; font-size: 1.15rem; font-weight: 700; color: #7b5ea7; }
        .kpi-val.orange { color: #c2632a; }
        .kpi-val.green  { color: #1a6b3a; }
        .kpi-lbl { font-size: .68rem; color: #aaa; margin-top: .15rem; }
        .sec-head { font-family: 'Noto Serif TC', serif; font-size: .92rem; font-weight: 700; color: #7b5ea7; border-left: 4px solid #7b5ea7; padding: .5rem 1rem; background: #f7f4ff; margin: 2rem 0 .75rem; display: flex; align-items: center; justify-content: space-between; }
        .sec-head.orange { color: #c2632a; border-color: #c2632a; background: #fff8f4; }
        .sec-head.green  { color: #1a6b3a; border-color: #1a6b3a; background: #f0fdf4; }
        .sec-head span   { font-size: .68rem; color: #aaa; font-weight: 300; font-family: 'Noto Sans TC', sans-serif; }
        .btn-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .btn { display: inline-block; padding: .4rem .85rem; background: #fff; border: 1px solid #c8b8e8; color: #7b5ea7; font-size: .78rem; font-weight: 500; text-decoration: none; border-radius: 2px; transition: all .15s; }
        .btn:hover { background: #f7f4ff; }
        .btn.orange { border-color: #f0c4a0; color: #c2632a; }
        .btn.orange:hover { background: #fff8f4; }
        .btn.green  { border-color: #a8d5b5; color: #1a6b3a; }
        .btn.green:hover { background: #f0fdf4; }
        .card-list { display: grid; gap: .6rem; }
        .card { background: #fff; border: 1px solid #e8ecf5; padding: .85rem 1rem; display: flex; gap: 1rem; align-items: flex-start; text-decoration: none; transition: border-color .15s; }
        .card:hover { border-color: #7b5ea7; }
        .card-main { flex: 1; min-width: 0; }
        .card-title { font-size: .85rem; font-weight: 500; color: #1a2a4a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-sub   { font-size: .72rem; color: #888; margin-top: .2rem; }
        .card-price { font-family: 'Noto Serif TC', serif; font-weight: 700; font-size: 1rem; color: #c2632a; white-space: nowrap; }
        .card-price-lbl { font-size: .62rem; color: #aaa; }
        .card-price.blue  { color: #2a5298; }
        .card-price.green { color: #1a6b3a; }
        .dist-tag { display: inline-block; background: #f7f4ff; color: #7b5ea7; border: 1px solid #c8b8e8; font-size: .66rem; padding: .1rem .4rem; border-radius: 2px; margin-right: 4px; }
        .desc-block { background: #fff; border: 1px solid #e8ecf5; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; font-size: .85rem; color: #555; line-height: 2; }
        .info-row { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: .85rem; font-size: .78rem; }
        .info-item { color: #888; }
        .info-item strong { color: #444; }
        .empty-note { font-size: .78rem; color: #bbb; padding: 1rem; text-align: center; background: #fff; border: 1px dashed #e0e8f8; }
        @media(max-width:640px){ .kpi4 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',   item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '重劃區', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/land-readjustment` },
          { '@type': 'ListItem', position: 3, name: `${city}市`, item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/land-readjustment/${cityEnc}` },
          { '@type': 'ListItem', position: 4, name: `${city}${period}重劃區` },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/land-readjustment" className="nav-link" style={{ color: '#7b5ea7' }}>重劃區</a>
          <a href="/price"   className="nav-link">實價登錄</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/presale" className="nav-link">預售屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #7b5ea7', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/land-readjustment" className="crumb">重劃區</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <a href={`/land-readjustment/${cityEnc}`} className="crumb">{city}市</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#7b5ea7', fontWeight: 500 }}>{period}</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#7b5ea7', marginBottom: '.4rem' }}>LAND READJUSTMENT · {city} {period}</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            {city}{period}重劃區（{name}）
          </h1>
          <p style={{ fontSize: '.82rem', color: '#555', lineHeight: 1.9, margin: 0 }}>
            行政區：{districts.map(d => <span key={d} className="dist-tag">{d}</span>)}
            {area !== '—' && <>&emsp;面積：<strong>{area} 公頃</strong></>}
            &emsp;完成：<strong>{completedYear}</strong>
          </p>
        </div>
      </div>

      <div className="kpi4">
        <div className="kpi-cell">
          <div className="kpi-lbl">近兩年成屋均坪（萬/坪）</div>
          <div className="kpi-val">{avgUnit ?? '—'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-lbl">近兩年成屋成交（筆）</div>
          <div className="kpi-val">{totalLvrN > 0 ? totalLvrN.toLocaleString() : '—'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-lbl">預售均坪（萬/坪）</div>
          <div className="kpi-val green">{avgPresaleUnit ?? '—'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-lbl">法拍均底（萬）</div>
          <div className="kpi-val orange">{avgAuction !== null ? avgAuction.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="wrap">
        <div className="desc-block">
          <strong>{city}{period}重劃區介紹</strong>
          <p style={{ margin: '.65rem 0 0' }}>{description}</p>
          <div className="info-row">
            {area !== '—' && <div className="info-item">重劃面積：<strong>{area} 公頃</strong></div>}
            <div className="info-item">行政區域：<strong>{districts.join('、')}</strong></div>
            <div className="info-item">完成年度：<strong>{completedYear}</strong></div>
          </div>
        </div>

        <div className="btn-row">
          {districts.map(d => (
            <a key={`p-${d}`} href={`/price/${encodeURIComponent(dbCity)}/${encodeURIComponent(d)}`} className="btn">📊 {d} 實價登錄</a>
          ))}
          {districts.map(d => (
            <a key={`a-${d}`} href={`/auction/${encodeURIComponent(dbCity)}/${encodeURIComponent(d)}`} className="btn orange">🏛️ {d} 法拍屋</a>
          ))}
          {districts.map(d => (
            <a key={`s-${d}`} href={`/presale/${encodeURIComponent(dbCity)}/${encodeURIComponent(d)}`} className="btn green">🏗️ {d} 預售建案</a>
          ))}
        </div>

        <div className="sec-head orange">
          <span>本區近期法拍物件</span>
          <span>最新 {auctions.length} 筆</span>
        </div>
        {auctions.length === 0 ? (
          <div className="empty-note">本區目前無法拍物件資料</div>
        ) : (
          <div className="card-list">
            {auctions.map((a: any) => (
              <a key={a.id} href={`/auction/${encodeURIComponent(dbCity)}/${encodeURIComponent(a.district)}/${a.id}`} className="card">
                <div className="card-main">
                  <div className="card-title">{a.title || '—'}</div>
                  <div className="card-sub">{a.district}{a.category ? ` · ${a.category}` : ''}{a.floor ? ` · ${a.floor}` : ''}{a.auction_date ? ` · 開標 ${String(a.auction_date).slice(0,10)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-price-lbl">底價</div>
                  <div className="card-price">{a.price ? `${Math.round(Number(a.price)/10000).toLocaleString()} 萬` : '—'}</div>
                </div>
              </a>
            ))}
          </div>
        )}
        {auctions.length > 0 && (
          <div style={{ marginTop: '.6rem', textAlign: 'right' }}>
            {districts.map(d => (
              <a key={d} href={`/auction/${encodeURIComponent(dbCity)}/${encodeURIComponent(d)}`}
                style={{ fontSize: '.75rem', color: '#c2632a', textDecoration: 'none', marginLeft: '1rem' }}>
                查看 {d} 全部法拍 →
              </a>
            ))}
          </div>
        )}

        <div className="sec-head green">
          <span>本區預售建案</span>
          <span>近期成交 {presales.length} 個建案</span>
        </div>
        {presales.length === 0 ? (
          <div className="empty-note">本區目前無預售屋備查資料</div>
        ) : (
          <div className="card-list">
            {presales.map((p: any) => (
              <a key={p.project_name}
                href={`/presale/${encodeURIComponent(dbCity)}/${encodeURIComponent(districts[0])}/${encodeURIComponent(p.project_name)}`}
                className="card">
                <div className="card-main">
                  <div className="card-title">{p.project_name}</div>
                  <div className="card-sub">成交 {Number(p.n).toLocaleString()} 筆 · 最近 {String(p.last_date||'').slice(0,7)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-price-lbl">均坪</div>
                  <div className="card-price green">{p.avg_unit ? `${toWanPerPing(Number(p.avg_unit))} 萬` : '—'}</div>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="sec-head">
          <span>本區近期成屋成交（實價登錄）</span>
          <span>近兩年 · 最新 {lvrRows.length} 筆</span>
        </div>
        {lvrRows.length === 0 ? (
          <div className="empty-note">本區目前無實價登錄資料</div>
        ) : (
          <div className="card-list">
            {lvrRows.map((r: any, i: number) => (
              <a key={i}
                href={`/community/${encodeURIComponent(dbCity)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.address)}`}
                className="card">
                <div className="card-main">
                  <div className="card-title">{r.address || '—'}</div>
                  <div className="card-sub">
                    {r.district}{r.building_type ? ` · ${r.building_type}` : ''}{r.area_sqm ? ` · ${(Number(r.area_sqm)*0.3025).toFixed(1)} 坪` : ''}
                    {r.floor ? ` · ${r.floor}` : ''} · {String(r.tx_date_iso||'').slice(0,7)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-price-lbl">成交</div>
                  <div className="card-price blue">{r.total_price ? `${Math.round(Number(r.total_price)/10000).toLocaleString()} 萬` : '—'}</div>
                  {r.unit_price_sqm && <div style={{ fontSize: '.65rem', color: '#888', marginTop: '.15rem' }}>{toWanPerPing(Number(r.unit_price_sqm))} 萬/坪</div>}
                </div>
              </a>
            ))}
          </div>
        )}
        {lvrRows.length > 0 && (
          <div style={{ marginTop: '.6rem', textAlign: 'right' }}>
            {districts.map(d => (
              <a key={d} href={`/price/${encodeURIComponent(dbCity)}/${encodeURIComponent(d)}`}
                style={{ fontSize: '.75rem', color: '#7b5ea7', textDecoration: 'none', marginLeft: '1rem' }}>
                查看 {d} 完整行情 →
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2.5rem', background: '#f7f4ff', border: '1px solid #c8b8e8', borderLeft: '4px solid #7b5ea7', padding: '1rem 1.25rem', fontSize: '.78rem', color: '#9b7ec7', lineHeight: 1.9 }}>
          <strong style={{ color: '#7b5ea7' }}>資料說明</strong><br />
          · 法拍物件來源：司法院法拍公告，底價非成交價<br />
          · 預售建案來源：內政部預售屋備查資料<br />
          · 實價成交來源：內政部實價登錄，近兩年建物成交記錄<br />
          · 資料範圍：{hasSegs ? `以官方地段名精確過濾（${data.segments!.join('、')}）` : `以行政區（${districts.join('、')}）為單位查詢，涵蓋整個行政區`}
        </div>
      </div>
    </>
  );
}
