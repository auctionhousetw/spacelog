import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';
import ShareButtons from '@/components/ShareButtons';

// ─── Prisma Singleton ──────────────────────────────────────────────────────────
const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
import prismaLvr from '@/lib/prisma-lvr';

export const revalidate = 86400;

// ─── 設計 Token（與 ArticleClient 同源） ──────────────────────────────────────
// #c2632a  主色（磚紅橙）
// #fff8f4  暖奶油底
// #f0c4a0  淡橙邊線
// #e8a87a  h3 左色條
// #ececec  一般分隔線
// #444 / #888 / #aaa / #ccc  內文灰階

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

function cleanFloor(raw: string | null | undefined): string {
  if (!raw) return '';
  const m = raw.match(/^[\d\-~+]+樓(?:\/共\d+樓)?/);
  return m ? m[0] : raw.slice(0, 20);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** eyebrow 小標籤 */
const Badge = ({
  children,
  variant = 'dim',
}: {
  children: React.ReactNode;
  variant?: 'orange' | 'green' | 'red' | 'dim' | 'teal';
}) => {
  const map: Record<string, React.CSSProperties> = {
    orange: { background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0' },
    green:  { background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5' },
    red:    { background: '#fff4f4', color: '#b03a3a', border: '1px solid #f0b0b0' },
    dim:    { background: '#fafafa', color: '#aaa',    border: '1px solid #ececec' },
    teal:   { background: '#f0faf7', color: '#1a7a5e', border: '1px solid #9fd8c4' },
  };
  return (
    <span style={{
      ...map[variant],
      display: 'inline-block',
      fontSize: 9.5, fontWeight: 500,
      letterSpacing: '.17em', textTransform: 'uppercase' as const,
      padding: '.22rem .72rem', borderRadius: 2,
      fontFamily: "'Noto Sans TC', sans-serif",
    }}>
      {children}
    </span>
  );
};

/** 左色條區段標題 — 對應 ArticleClient h2 */
const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{
    fontFamily: "'Noto Serif TC', serif",
    fontSize: '1.05rem', fontWeight: 700,
    color: '#c2632a', letterSpacing: '.03em',
    background: '#fff8f4',
    borderLeft: '4px solid #c2632a',
    padding: '.65rem 1rem',
    margin: 0,
  }}>
    {children}
  </h2>
);

/** InfoRow — 左右並排，label 淺灰 / value 深色粗體，對比清晰 */
const InfoRow = ({
  label, value, accent = false, green = false, last = false,
}: {
  label: string;
  value: string | number | null | undefined;
  accent?: boolean; green?: boolean; last?: boolean;
}) => {
  const empty = value === null || value === undefined || value === '' || value === '—' || value === 0;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'baseline', gap: 12,
      padding: '.65rem 0',
      borderBottom: last ? 'none' : '1px solid #f0f0f0',
    }}>
      {/* label：中灰、正常大小、不加粗 — 清楚但不搶戲 */}
      <span style={{
        fontSize: '.85rem', fontWeight: 400, color: '#888',
        flexShrink: 0, fontFamily: "'Noto Sans TC', sans-serif",
      }}>
        {label}
      </span>
      {/* value：深色、加粗、serif — 一眼跳出 */}
      <span style={{
        fontSize: '.925rem',
        fontWeight: empty ? 300 : 600,
        color: empty ? '#ccc' : accent ? '#c2632a' : green ? '#3a7d2c' : '#222',
        fontFamily: empty ? "'Noto Sans TC', sans-serif" : "'Noto Serif TC', serif",
        fontStyle: empty ? 'italic' : 'normal',
        textAlign: 'right',
      }}>
        {empty ? '未提供' : value}
      </span>
    </div>
  );
};

/** 三欄核心數字 — 對應 ArticleClient 市場行情速報 */
const StatCard = ({
  label, value, sub, accent = false,
}: {
  label: string; value: string | number | null | undefined; sub?: string; accent?: boolean;
}) => {
  const empty = value === null || value === undefined || value === '' || value === '—' || value === 0;
  return (
    <div style={{ borderLeft: `2px solid ${accent ? '#c2632a' : '#e8a87a'}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3, letterSpacing: '.08em', fontFamily: "'Noto Sans TC', sans-serif" }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 600, lineHeight: 1.3,
        color: empty ? '#ddd' : accent ? '#c2632a' : '#444',
        fontFamily: "'Noto Serif TC', serif", letterSpacing: '.01em',
      }}>
        {empty ? '—' : value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 3, fontWeight: 300, fontFamily: "'Noto Sans TC', sans-serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
};

/** 快捷資訊小格 */
const QuickTag = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <div style={{ fontSize: '.72rem', color: '#aaa', fontWeight: 300, letterSpacing: '.04em', fontFamily: "'Noto Sans TC', sans-serif", marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: '.875rem', color: value ? '#444' : '#ddd', fontWeight: value ? 400 : 300, fontFamily: "'Noto Sans TC', sans-serif" }}>
      {value || '—'}
    </div>
  </div>
);

/** 快速特色標籤 pill */
const FeatureChip = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 400, color: '#c2632a',
    background: '#fff3ee', border: '1px solid #f0c4a0',
    padding: '.2rem .65rem', borderRadius: 2,
    fontFamily: "'Noto Sans TC', sans-serif",
  }}>
    <span>{icon}</span>{children}
  </span>
);

// ─── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; district: string; id: string }>;
}) {
  const { id } = await params;
  const item = await prisma.houses.findUnique({ where: { id } });
  if (!item) return { title: '法拍物件詳情' };
  const priceWan = item.price ? Math.floor(item.price / 10000) : null;
  const loc = [item.city, item.district].filter(Boolean).join('');
  return {
    title: item.title?.replace(/-[^-]+[市縣].*$/, '') || item.address || `${loc}法拍物件`,
    description: [
      `${loc}法拍${item.type || '屋'}`,
      item.address,
      priceWan ? `底價 ${priceWan} 萬` : null,
      item.total_ping ? `${item.total_ping} 坪` : null,
      item.auction_date ? `開標 ${item.auction_date}` : null,
      item.delivery ? item.delivery : null,
    ].filter(Boolean).join('・'),
    alternates: { canonical: `/auction/${encodeURIComponent(item.city || '')}/${encodeURIComponent(item.district || '')}/${id}` },
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default async function ItemPage({
  params,
}: {
  params: Promise<{ city: string; district: string; id: string }>;
}) {
  const { city, district: dist, id } = await params;
  const item = await prisma.houses.findUnique({ where: { id } });
  if (!item) notFound();

  const cityDecoded = decodeURIComponent(city);
  const distDecoded = decodeURIComponent(dist);
  const catDecoded  = '法拍屋';

  const formatWan = (price: number | null) =>
    price ? `${Math.floor(price / 10000).toLocaleString()} 萬` : null;

  // ── blob 救援（FAPAI broker text + 承明全頁文字） ──────────────────────────
  const auctionBlob = (item.auction_date && item.auction_date.length > 20) ? item.auction_date : '';
  const blob = auctionBlob + '\n' + (item.description || '');

  // 試多個 pattern，回傳第一個命中的 group 1
  const bg = (...patterns: RegExp[]) => {
    for (const p of patterns) { const m = blob.match(p); if (m) return m[1].trim(); }
    return '';
  };

  // 判斷 description 是否為爬蟲版權內容（承明、uhomes 等公司頁面），若是則不顯示
  const BRAND_MARKERS = [
    '承明法拍屋', 'Cheng Ming Development', '法拍屋代標公告查詢資訊網',
    'uhomes.com', 'www.s41349.com', '法拍代標', '代標法拍屋',
    '連絡人', '承明開發有限公司',
  ];
  const desc = item.description || '';
  const isBrandedContent = BRAND_MARKERS.some(m => desc.includes(m));

  // 只顯示法院公告文字（公開資料），不顯示代標商版權內容
  let cleanDesc = '';
  if (!isBrandedContent && desc.length > 10) {
    // 去廣告尾巴（法院公告也可能帶小廣告）
    const SPAM_TAIL = ['很多人覺得買法拍', '公司注重商譽', '★歡迎加入', '免費諮詢專線', '頂信代標'];
    cleanDesc = desc;
    for (const marker of SPAM_TAIL) {
      const idx = cleanDesc.indexOf(marker);
      if (idx > 0) { cleanDesc = cleanDesc.substring(0, idx).trim(); break; }
    }
  }
  const displayDescription = cleanDesc || undefined;

  // 開標日：DB 乾淨值 > blob 斜線格式 > 承明漢字格式
  let displayAuctionDate = (item.auction_date && item.auction_date.length <= 20 && item.auction_date.length >= 5)
    ? item.auction_date : '';
  if (!displayAuctionDate) {
    const dm = blob.match(/(\d{2,4}[./\-]\d{1,2}[./\-]\d{1,2})/);
    if (dm) displayAuctionDate = dm[1];
  }
  if (!displayAuctionDate) {
    const cm = blob.match(/拍賣日期\s*(\d{3})年(\d{1,2})月(\d{1,2})日/);
    if (cm) displayAuctionDate = `${parseInt(cm[1]) + 1911}-${cm[2].padStart(2,'0')}-${cm[3].padStart(2,'0')}`;
  }

  const r = {
    total_ping:  item.total_ping  || bg(/總建物面積[：:]([\d.]+)坪/,      /拍賣總坪\s*([\d.]+)\s*坪/),
    main_ping:   item.main_ping   || bg(/主建物面積[：:]([\d.]+)坪/,      /主建面積\s*([\d.]+)\s*坪/),
    sub_ping:    item.sub_ping    || bg(/附建物面積[：:]([\d.]+)坪/,      /附屬面積\s*([\d.]+)\s*坪/),
    extra_ping:  item.extra_ping  || bg(/增建面積[：:]([\d.]+)坪/,        /增建面積\s*([\d.]+)\s*坪/),
    land_ping:   item.land_ping   || bg(/土地面積[：:]([\d.]+)坪/,        /土地面積\s*([\d.]+)\s*坪/),
    floor:       cleanFloor(item.floor) || bg(/樓別[/／]樓高[：:]([^\n底保點目土鄰生活交]{1,25})/, /樓層\s*(\S+)/),
    deposit:     item.deposit     || bg(/保證金[：:\s]*([\d.]+\s*萬)/),
    land_use:    item.land_use    || bg(/土地用途[/／]建物類型[：:]([^\n鄰生活交]{1,50})/),
    near_school: item.near_school || bg(/鄰近學[校區][：:]([^\n生活交]{1,50})/),
    living:      item.living      || bg(/生活機能[：:]([^\n交通鄰]{1,50})/),
    near_traffic:item.near_traffic|| bg(/交通狀況[：:]([^\n]{1,100})/),
    age:         item.age         || bg(/屋齡[：:\s]*([\d.]+\s*年?)/,    /屋齡\s*([\d.]+)\s*年/),
    orientation: item.orientation || bg(/座向[：:\s]*([^\n\s]{1,10})/,   /座向\s*(\S+)/),
    delivery_disp: item.delivery  || bg(/點交(?:情形|否|狀況)[：:\s]*([^\s\n]{1,20})/),
    unit_price_str: item.unit_price_str || (item.unit_price ? `${item.unit_price} 萬/坪` : ''),
  };

  const priceWan     = formatWan(item.price);
  // 下次預估：從目前底價 × 0.8 計算，不用 next_price 欄位（可能存的是上一拍）
  const nextPriceWan = item.price
    ? `${Math.floor(item.price * 0.8 / 10000).toLocaleString()} 萬`
    : null;

  // Google Maps 嵌入網址（免 API Key）
  const mapEmbedUrl = item.address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(item.address)}&hl=zh-TW&z=16&output=embed`
    : null;

  // 開標日期 + 時間合併顯示
  const auctionDatetime = [displayAuctionDate, (item as any).auction_time].filter(Boolean).join(' ');

  // 底價折數（vs 市場行情）
  const discountPct = (item.price && item.unit_price && r.total_ping)
    ? Math.round((1 - item.price / (item.unit_price * parseFloat(r.total_ping) * 10000)) * 100)
    : null;

  // 歷史底價走勢：以實際拍次為基準，每拍降 20%
  const roundNum = item.auction_round
    ? (parseInt(item.auction_round.match(/\d+/)?.[0] ?? '1', 10) || 1)
    : 1;
  const priceHistory = item.price ? (() => {
    const cur = item.price!;
    const rows = [];
    const start = Math.max(1, roundNum - 2); // 最多顯示前2拍
    const end   = roundNum + 2;              // 顯示後2拍
    for (let i = start; i <= end; i++) {
      const factor = Math.pow(0.8, i - roundNum);
      const p = Math.floor(cur * factor / 10000);
      if (p <= 0) break;
      rows.push({
        label: i < roundNum ? `第 ${i} 拍` : i === roundNum ? `第 ${i} 拍（目前）` : `第 ${i} 拍（預估）`,
        price: p,
        active: i === roundNum,
      });
    }
    return rows;
  })() : [];

  // 狀態顏色
  let statusVariant: 'orange' | 'red' | 'green' | 'dim' = 'dim';
  if (item.status?.includes('待標')) statusVariant = 'orange';
  else if (item.status?.includes('議價')) statusVariant = 'red';
  else if (item.status?.includes('拍定') || item.status?.includes('成交')) statusVariant = 'green';

  const hasValue = (...vals: (string | number | null | undefined)[]) =>
    vals.some(v => v !== null && v !== undefined && v !== '' && v !== '—' && v !== 0);

  // 快速特色標籤（有值才顯示）
  const featureChips = [
    { icon: '🚇', label: '捷運', value: r.near_traffic },
    { icon: '🏫', label: '學區', value: r.near_school },
    { icon: '🚗', label: '車位', value: item.parking },
    { icon: '🏢', label: '社區', value: item.community },
    { icon: '🛗', label: '電梯', value: item.elevator },
    { icon: '🌿', label: '生活機能', value: r.living },
  ].filter(c => c.value && c.value.trim());

  // 同行政區近期法拍 + 實價登錄
  const safeCity2 = (item.city || cityDecoded).replace(/'/g, "''");
  const safeDist2 = (item.district || distDecoded).replace(/'/g, "''");
  const safeId    = id.replace(/'/g, "''");

  // ── 精準估價：依建物類型 + 坪數範圍篩選 ──────────────────────────────────
  const itemAreaSqm = item.area ? item.area * 3.30579 : null;
  const areaLo = itemAreaSqm ? (itemAreaSqm * 0.7).toFixed(2) : null;
  const areaHi = itemAreaSqm ? (itemAreaSqm * 1.3).toFixed(2) : null;

  // land_use → lvr building_type 對應
  const lu = (item.land_use || '').replace(/'/g, "''");
  let btypeClause = '';
  if (lu.includes('透天'))                          btypeClause = `AND building_type LIKE '%透天厝%'`;
  else if (lu.includes('大樓') || lu.includes('電梯')) btypeClause = `AND building_type LIKE '%住宅大樓%'`;
  else if (lu.includes('公寓'))                      btypeClause = `AND building_type LIKE '%公寓%'`;
  else if (lu.includes('華廈'))                      btypeClause = `AND building_type LIKE '%華廈%'`;

  const areaClause  = (areaLo && areaHi) ? `AND area_sqm BETWEEN ${areaLo} AND ${areaHi}` : '';
  const hasFilter   = btypeClause !== '' || areaClause !== '';

  const [relatedItems, lvrStats, lvrStatsMatched, lvrRecent] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, title, address, price, auction_date, type, city, district FROM houses ` +
      `WHERE city = '${safeCity2}' AND district = '${safeDist2}' AND id != '${safeId}' ` +
      `ORDER BY CASE WHEN auction_date IS NULL OR auction_date = '' THEN 1 ELSE 0 END, auction_date DESC ` +
      `LIMIT 5`
    ),
    // 舊方法：同行政區均值（作為備用）
    prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as n,
              AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price,
              AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
              MAX(tx_date_iso) as latest
       FROM lvr_land
       WHERE city = '${safeCity2}' AND district = '${safeDist2}'
         AND tx_type LIKE '%建物%'
         AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')`
    ).catch(() => []),
    // 新方法：同類型 + 相近坪數（近一年，不足退兩年）
    hasFilter
      ? prismaLvr.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*) as n,
                  AVG(CASE WHEN total_price > 0 THEN total_price END) as avg_price,
                  AVG(CASE WHEN unit_price_sqm > 0 THEN unit_price_sqm END) as avg_unit,
                  MAX(tx_date_iso) as latest
           FROM lvr_land
           WHERE city = '${safeCity2}' AND district = '${safeDist2}'
             AND tx_type LIKE '%建物%'
             ${btypeClause}
             ${areaClause}
             AND tx_date_iso >= to_char(CURRENT_DATE - INTERVAL '1 year', 'YYYY-MM-DD')`
        ).catch(() => [])
      : Promise.resolve([]),
    // 近期成交案例（條件篩選版，含 build_complete 供屋齡調整）
    prismaLvr.$queryRawUnsafe<any[]>(
      `SELECT address, total_price, unit_price_sqm, area_sqm, tx_date_iso,
              bedrooms, halls, floor, building_type, build_complete
       FROM lvr_land
       WHERE city = '${safeCity2}' AND district = '${safeDist2}'
         AND tx_type LIKE '%建物%'
         AND total_price > 0
         ${btypeClause}
         ${areaClause}
       ORDER BY tx_date_iso DESC
       LIMIT 10`
    ).catch(() => []),
  ]);

  // ── 選用哪個統計（精準優先，樣本不足時退回均值）─────────────────────────
  const matchedSt  = lvrStatsMatched[0] || null;
  const matchedN   = Number(matchedSt?.n || 0);
  const useMatched = matchedN >= 3;
  const lvrSt      = useMatched ? matchedSt : (lvrStats[0] || null);
  const lvrMethod  = useMatched ? 'matched' : 'district';  // 供 UI 標示

  // 實價統計計算
  const lvrAvgWan  = lvrSt?.avg_price ? Math.round(Number(lvrSt.avg_price) / 10000) : null;
  const lvrUnitWan = lvrSt?.avg_unit  ? (Number(lvrSt.avg_unit) * 3.30579 / 10000).toFixed(1) : null;
  // 折扣率：法拍底價 vs 實價均價
  const discountVsMarket = (item.price && lvrSt?.avg_price && Number(lvrSt.avg_price) > 0)
    ? Math.round((1 - item.price / Number(lvrSt.avg_price)) * 100)
    : null;
  const hasLvr = lvrRecent.length > 0 || lvrAvgWan !== null;

  // ── Phase 2: 屋齡調整 ────────────────────────────────────────────────────────
  const CUR_YR = 2026;
  const parseRocYear = (s: string | null | undefined): number | null => {
    if (!s) return null;
    const d = s.replace(/\D/g, '');
    if (d.length < 3) return null;
    const roc = parseInt(d.slice(0, 3));
    return (roc > 0 && roc <= 150) ? roc + 1911 : null;
  };
  const parseAge = (s: string | null | undefined): number | null => {
    const m = (s || '').match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  };
  const medianOf = (arr: number[]): number => {
    if (!arr.length) return 0;
    return [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  };

  const compBuildYears = lvrRecent
    .map((c: any) => parseRocYear(c.build_complete))
    .filter((y): y is number => y !== null && y > 1950 && y <= CUR_YR);
  const compAges = compBuildYears.map(y => CUR_YR - y);
  const medCompAge = compAges.length >= 2 ? medianOf(compAges) : null;

  const subjectAge = parseAge(item.age);
  let ageAdjFactor = 1.0;
  if (subjectAge !== null && medCompAge !== null) {
    const delta = subjectAge - medCompAge;
    if (Math.abs(delta) >= 1.5) {
      ageAdjFactor = delta > 0
        ? Math.max(0.65, 1.0 - delta * 0.007)
        : Math.min(1.10, 1.0 - delta * 0.003);
    }
  }
  const ageAdjApplied = Math.abs(ageAdjFactor - 1.0) > 0.001;
  const ageAdjPct     = Math.round((ageAdjFactor - 1.0) * 100);

  // 本物件估值：均坪價 × 屋齡調整係數 × 坪數
  const lvrUnitAdj = lvrUnitWan ? parseFloat(lvrUnitWan) * ageAdjFactor : null;
  const lvrUnitWanAdj = lvrUnitAdj ? lvrUnitAdj.toFixed(1) : lvrUnitWan;
  const subjectPing = item.area ?? null;
  const estimatedValueWan = (lvrUnitAdj && subjectPing)
    ? Math.round(lvrUnitAdj * subjectPing)
    : null;
  const discountVsEstimated = (item.price && estimatedValueWan && estimatedValueWan > 0)
    ? Math.round((1 - item.price / (estimatedValueWan * 10000)) * 100)
    : discountVsMarket;

  // ── 共用樣式 ──────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderTop: '1px solid #ececec',
    borderBottom: '1px solid #ececec',
    marginBottom: 1, overflow: 'hidden',
  };
  const padStyle: React.CSSProperties = {
    padding: '1.25rem clamp(1.25rem,4vw,2rem)',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9.5, fontWeight: 500,
    letterSpacing: '.2em', textTransform: 'uppercase' as const,
    color: '#c2632a', fontFamily: "'Noto Sans TC', sans-serif", marginBottom: '1rem',
  };
  const dimLabelStyle: React.CSSProperties = { ...labelStyle, color: '#ccc' };

  const BASE = process.env.NEXT_PUBLIC_BASE_URL || '';

  const itemCity = item.city || cityDecoded;
  const itemDist = item.district || distDecoded;
  const relatedPeriods = itemCity.includes('台中')
    ? (TAICHUNG_DISTRICT_PERIODS[itemDist] || [])
    : [];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '首頁', item: BASE },
              { '@type': 'ListItem', position: 2, name: `${item.city || cityDecoded}法拍屋`, item: `${BASE}/auction/${encodeURIComponent(item.city || cityDecoded)}` },
              { '@type': 'ListItem', position: 3, name: `${item.city || cityDecoded}${item.district || distDecoded}法拍屋`, item: `${BASE}/auction/${encodeURIComponent(item.city || cityDecoded)}/${encodeURIComponent(item.district || distDecoded)}` },
              { '@type': 'ListItem', position: 4, name: item.title?.replace(/-[^-]+[市縣].*$/, '') || item.address || '物件詳情' },
            ],
          },
          {
            '@type': 'RealEstateListing',
            name: item.title?.replace(/-[^-]+[市縣].*$/, '') || item.address || `${item.city}${item.district}法拍屋`,
            description: `${item.city}${item.district}法拍${item.type || '屋'}，底價 ${priceWan}，${r.total_ping ? `${r.total_ping} 坪，` : ''}開標日 ${displayAuctionDate}。`,
            image: `${BASE}/og.png`,
            url: `${BASE}/auction/${encodeURIComponent(item.city || '')}/${encodeURIComponent(item.district || '')}/${id}`,
            ...(item.address ? { address: { '@type': 'PostalAddress', streetAddress: item.address, addressRegion: item.city, addressCountry: 'TW' } } : {}),
            ...(r.total_ping ? { floorSize: { '@type': 'QuantitativeValue', value: parseFloat(r.total_ping), unitText: '坪' } } : {}),
            ...(displayAuctionDate ? { datePosted: displayAuctionDate } : {}),
          },
        ],
      }) }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: #fafafa; }

        .fp-crumb { color: #bbb; font-size: 11px; font-weight: 300; transition: color .15s; font-family: 'Noto Sans TC', sans-serif; text-decoration: none; }
        .fp-crumb:hover { color: #c2632a; }

        .fp-btn { display: block; width: 100%; padding: .6rem 0; text-align: center; font-size: .8rem; font-weight: 500; font-family: 'Noto Sans TC', sans-serif; letter-spacing: .08em; cursor: pointer; transition: all .18s; text-decoration: none; border-radius: 2px; margin-bottom: 8px; }
        .fp-btn:last-child { margin-bottom: 0; }
        .fp-btn-primary { background: #c2632a; color: #fff !important; border: none; }
        .fp-btn-primary:hover { background: #a04d1e; }
        .fp-btn-ghost { background: none; color: #aaa !important; border: 1px solid #ddd; }
        .fp-btn-ghost:hover { border-color: #c2632a; color: #c2632a !important; }
        .fp-btn-disabled { background: none; color: #ddd !important; border: 1px solid #f0f0f0; cursor: not-allowed; }

        .fp-hist-row { display: flex; justify-content: space-between; align-items: center; padding: .48rem 0; border-bottom: 1px solid #f5f5f5; font-size: .82rem; font-family: 'Noto Sans TC', sans-serif; }
        .fp-hist-row:last-child { border-bottom: none; }

        .fp-notice-li { font-size: .82rem; color: #b07340; font-weight: 300; padding: .28rem 0; line-height: 1.85; font-family: 'Noto Sans TC', sans-serif; }
        .fp-notice-li::before { content: '·  '; }

        .fp-util-btn { background: none; border: 1px solid #ececec; border-radius: 2px; padding: .5rem .25rem; font-size: .75rem; color: #aaa; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; display: flex; flex-direction: column; align-items: center; gap: 3; transition: all .15s; }
        .fp-util-btn:hover { border-color: #c2632a; color: #c2632a; }
        .fp-rel-row { display: block; padding: .75rem clamp(1.25rem,4vw,2rem); border-bottom: 1px solid #f5f5f5; text-decoration: none; transition: background .15s; }
        .fp-rel-row:hover { background: #fff8f4; }

        @media (max-width: 720px) {
          .fp-main  { grid-template-columns: 1fr !important; }
          .fp-quick { grid-template-columns: repeat(3, 1fr) !important; }
          .fp-stat  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <main style={{ minHeight: '100vh', background: '#fafafa', fontFamily: "'Noto Sans TC', sans-serif", color: '#444', paddingBottom: '6rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(1rem,4vw,1.75rem)' }}>

          {/* ── 麵包屑 ── */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '1.4rem 0 1.1rem', fontSize: 11 }}>
            {[
              { label: '首頁',      href: '/' },
              { label: '法拍屋', href: '/auction' },
              { label: cityDecoded, href: `/auction/${encodeURIComponent(cityDecoded)}` },
              { label: distDecoded, href: `/auction/${encodeURIComponent(cityDecoded)}/${encodeURIComponent(distDecoded)}` },
              { label: id },
            ].map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: '#e0e0e0' }}>›</span>}
                {'href' in c
                  ? <Link href={c.href!} className="fp-crumb">{c.label}</Link>
                  : <span style={{ color: '#888', fontWeight: 400, fontFamily: "'Noto Sans TC', sans-serif" }}>{c.label}</span>}
              </span>
            ))}
          </nav>

          {/* ══════════════════════════════════════════════════════════
              HERO — eyebrow → serif 大標 → 橘線 → 地址 → 特色標籤 → 四大數字
              ══════════════════════════════════════════════════════════ */}
          <div style={{ background: '#fff', borderTop: '1px solid #ececec', borderBottom: '1px solid #ececec', padding: 'clamp(1.75rem,5vw,2.75rem) clamp(1.25rem,4vw,2rem) clamp(1.5rem,4vw,2.25rem)', marginBottom: 1 }}>

            {/* Badge 列 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: '1.1rem', alignItems: 'center' }}>
              <Badge variant="orange">{item.type || '法拍屋'}</Badge>
              <Badge variant={statusVariant}>{item.status || '狀態未知'}</Badge>
              {item.auction_round && <Badge variant="dim">{item.auction_round}</Badge>}
              {r.delivery_disp && <Badge variant="green">✓ {r.delivery_disp}</Badge>}
              {item.haunted === '不是' && <Badge variant="teal">非凶宅</Badge>}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ccc', letterSpacing: '.05em', fontWeight: 300 }}>
                {item.case_number || id}
              </span>
            </div>

            {/* 主標題 */}
            <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,3.5vw,1.85rem)', fontWeight: 500, color: '#c2632a', lineHeight: 1.58, marginBottom: '1.1rem', letterSpacing: '.01em' }}>
              {item.title?.replace(/-[^-]+[市縣].*$/, '') || item.address || '未提供標題'}
            </h1>

            {/* 橘色分隔線 */}
            <div style={{ width: 24, height: 2, background: '#c2632a', marginBottom: '.9rem' }} />

            {/* 地址 */}
            <p style={{ fontSize: '.875rem', color: '#888', fontWeight: 300, marginBottom: '1.1rem', letterSpacing: '.02em' }}>
              📍 {item.address || `${cityDecoded} ${distDecoded}`}
            </p>

            {/* 快速特色標籤（捷運/學區/車位…） */}
            {featureChips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.4rem' }}>
                {featureChips.map(c => <FeatureChip key={c.label} icon={c.icon}>{c.label}</FeatureChip>)}
              </div>
            )}

            {/* 四大核心數字（新增「市價折數」欄） */}
            <div className="fp-stat" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'clamp(.75rem,2.5vw,1.75rem)', paddingTop: '1.25rem', borderTop: '1px solid #ececec' }}>
              <StatCard label="拍賣底價"   value={priceWan}          sub={r.deposit ? `保證金 ${r.deposit}` : '請洽執行法院'} accent />
              <StatCard label="每坪單價"   value={r.unit_price_str || null} sub={`總坪數 ${r.total_ping || item.area || '—'}`} />
              <StatCard label="開標日期"   value={auctionDatetime || null} sub={item.auction_round ? `目前 ${item.auction_round}` : '請確認最新公告'} />
              <StatCard label="市價折數"   value={discountPct !== null ? `約 ${discountPct}% off` : null} sub={nextPriceWan ? `下次預估 ${nextPriceWan}` : '再降 20% 可投'} />
            </div>
          </div>

          {/* ── 快速摘要橫列（新增車位 / 座向） ── */}
          <div className="fp-quick" style={{ background: '#fff', borderBottom: '1px solid #ececec', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', marginBottom: '1.5rem' }}>
            {[
              { label: '格局', value: item.layout },
              { label: '樓層', value: r.floor },
              { label: '屋齡', value: r.age },
              { label: '電梯', value: item.elevator },
              { label: '車位', value: item.parking },
              { label: '座向', value: r.orientation },
            ].map(({ label, value }, i, arr) => (
              <div key={label} style={{ padding: '.75rem .9rem', borderRight: i < arr.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                <QuickTag label={label} value={value} />
              </div>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════
              主體雙欄
              ══════════════════════════════════════════════════════════ */}
          <div className="fp-main" style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: '1.25rem', alignItems: 'start' }}>

            {/* ━━━━━━ 左欄 ━━━━━━ */}
            <div>

              {/* 【新增】照片／圖面區 */}
              <div style={cardStyle}>
                <div style={{ background: '#f5f5f3', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 32, opacity: .2 }}>🏠</span>
                  <span style={{ fontSize: '.75rem', color: '#ccc', letterSpacing: '.06em', fontFamily: "'Noto Sans TC', sans-serif" }}>
                    物件照片 · 地籍圖 · 法院估價報告
                  </span>
                </div>
              </div>

              {/* 坪數與建物規格 */}
              {hasValue(r.total_ping, r.main_ping, r.sub_ping, r.extra_ping, r.land_ping, item.parking, item.corner, r.orientation, item.community, item.hoa, item.courtyard, item.bcr, item.far, item.land_category) && (
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>坪數與建物規格</SectionHeading>
                <div style={padStyle}>
                  <InfoRow label="建物總登記坪數" value={r.total_ping ? `${r.total_ping} 坪` : null} />
                  <InfoRow label="主建物坪數"     value={r.main_ping  ? `${r.main_ping} 坪`  : null} />
                  <InfoRow label="附屬建物坪數"   value={r.sub_ping   ? `${r.sub_ping} 坪`   : null} />
                  <InfoRow label="增建面積"       value={r.extra_ping ? `${r.extra_ping} 坪` : null} />
                  <InfoRow label="土地登記坪數"   value={r.land_ping  ? `${r.land_ping} 坪`  : null} />
                  <InfoRow label="車位"           value={item.parking} />
                  <InfoRow label="邊間"           value={item.corner} />
                  <InfoRow label="座向"           value={r.orientation} />
                  <InfoRow label="社區／大樓"     value={item.community} />
                  <InfoRow label="管委會"         value={item.hoa} />
                  <InfoRow label="中庭"           value={item.courtyard} />
                  <InfoRow label="建蔽率"         value={item.bcr} />
                  <InfoRow label="容積率"         value={item.far} />
                  <InfoRow label="地目"           value={item.land_category} last />
                </div>
              </div>
              )}

              {/* 法拍詳細資訊 */}
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>法拍詳細資訊</SectionHeading>
                <div style={padStyle}>
                  <InfoRow label="案件編號"           value={item.case_number} />
                  <InfoRow label="開標日期 &amp; 時間" value={auctionDatetime || null} accent />
                  <InfoRow label="目前拍次"           value={item.auction_round} />
                  <InfoRow label="點交情形"           value={r.delivery_disp} green />
                  <InfoRow label="投標保證金"         value={r.deposit} accent />
                  <InfoRow label="拍賣底價"           value={priceWan} accent />
                  <InfoRow label="下次底價預估"       value={nextPriceWan} />
                  <InfoRow label="土地用途／建物類型"  value={r.land_use} />
                  <InfoRow label="是否凶宅"           value={item.haunted} last />
                </div>
              </div>

              {/* 【新增】歷史底價走勢 */}
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>歷史底價走勢</SectionHeading>
                <div style={padStyle}>
                  {priceHistory.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '.78rem', color: '#aaa', fontWeight: 300, fontFamily: "'Noto Sans TC', sans-serif" }}>
                          每拍降幅約 20%
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#c2632a', fontFamily: "'Noto Sans TC', sans-serif" }}>
                          目前 {item.auction_round || '第一拍'}
                        </span>
                      </div>
                      {priceHistory.map(row => (
                        <div key={row.label} className="fp-hist-row" style={{ opacity: row.active ? 1 : .5 }}>
                          <span style={{ color: row.active ? '#555' : '#aaa' }}>{row.label}</span>
                          <span style={{ fontWeight: row.active ? 500 : 300, color: row.active ? '#c2632a' : '#bbb' }}>
                            {row.price.toLocaleString()} 萬
                          </span>
                        </div>
                      ))}
                      <p style={{ fontSize: '.75rem', color: '#ccc', marginTop: '.75rem', fontWeight: 300, fontFamily: "'Noto Sans TC', sans-serif" }}>
                        * 預估值僅供參考，實際底價以法院公告為準
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: '.85rem', color: '#ccc', fontStyle: 'italic', margin: 0, fontWeight: 300 }}>暫無歷史底價資料</p>
                  )}
                </div>
              </div>

              {/* 周邊環境 */}
              {hasValue(r.near_school, r.near_traffic, r.living) && (
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>周邊環境</SectionHeading>
                <div style={padStyle}>
                  <InfoRow label="鄰近學區" value={r.near_school} />
                  <InfoRow label="交通狀況" value={r.near_traffic} />
                  <InfoRow label="生活機能" value={r.living} last />
                </div>
              </div>
              )}

              {/* 地理位置 Google Maps */}
              {mapEmbedUrl && (
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>📍 地理位置與周邊機能</SectionHeading>
                <div style={{ padding: 0, overflow: 'hidden' }}>
                  <iframe
                    title={`地圖 - ${item.address}`}
                    src={mapEmbedUrl}
                    width="100%"
                    height="380"
                    style={{ border: 0, display: 'block' }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div style={{ padding: '.6rem clamp(1.25rem,4vw,2rem)', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '.75rem', color: '#ccc', fontWeight: 300 }}>
                    可滑鼠滾輪縮放・點左上角查看街景與導航
                  </span>
                  <a
                    href={`https://maps.google.com/maps?q=${encodeURIComponent(item.address || '')}&hl=zh-TW`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '.75rem', color: '#c2632a', textDecoration: 'none', fontWeight: 500 }}>
                    在 Google Maps 中開啟 ↗
                  </a>
                </div>
              </div>
              )}

              {/* 物件描述 */}
              <div style={{ ...cardStyle, marginTop: 1 }}>
                <SectionHeading>物件描述</SectionHeading>
                <div style={padStyle}>
                  {displayDescription ? (
                    <p style={{ fontSize: '.9rem', color: '#555', lineHeight: 2.05, fontWeight: 300, whiteSpace: 'pre-wrap', margin: 0 }}>
                      {displayDescription}
                    </p>
                  ) : (
                    <p style={{ fontSize: '.875rem', color: '#ccc', fontWeight: 300, fontStyle: 'italic', margin: 0 }}>
                      本案件暫無提供詳細的物件描述內容。
                    </p>
                  )}
                </div>
              </div>

              {/* 投標注意事項（仿 ArticleClient blockquote + 新增兩條） */}
              <div style={{ marginTop: 1, background: '#fff8f4', borderTop: '1px solid #f0c4a0', borderBottom: '1px solid #f0c4a0', borderLeft: '4px solid #c2632a', padding: '1.5rem clamp(1.25rem,4vw,2rem)' }}>
                <span style={labelStyle}>投標前注意事項</span>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {[
                    '本平台資料僅供參考，一切以法院或執行單位公告為準。',
                    '投標前請務必親自勘查現況，確認物件實際狀態。',
                    '保證金通常為底價的 20–30%，請提前備妥現金票據。',
                    '法拍物件不一定點交，請事先確認點交情形，不點交須自行處理占用問題。',
                    '得標後須於期限內繳清尾款，逾期保證金沒入。',
                    '優先承買權人（共有人、地上權人）可於期限內以同價購買，請事先確認。',
                    '欠繳管理費、稅費等，得標人通常需代為清償，請列入成本計算。',
                  ].map((t, i) => <li key={i} className="fp-notice-li">{t}</li>)}
                </ul>
              </div>

              {/* ── 周邊實價登錄區塊 ── */}
              {hasLvr && (
              <div style={{ marginTop: '1.5rem', border: '1px solid #e0e8f8', borderLeft: '4px solid #2a5298', background: '#fff', overflow: 'hidden' }}>
                {/* 標題列 */}
                <div style={{ background: '#f0f5ff', padding: '.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.05rem', fontWeight: 700, color: '#2a5298', margin: 0 }}>
                    📊 周邊實際成交行情
                  </h2>
                  <span style={{ fontSize: '.75rem', color: '#6b8cc7', fontWeight: 300, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {lvrMethod === 'matched'
                      ? <span style={{ background: '#e8f4e8', color: '#3a7d2c', border: '1px solid #b5dba5', padding: '.1rem .45rem', borderRadius: 2, fontSize: 10, fontWeight: 500 }}>同類型比對</span>
                      : <span style={{ background: '#f5f5f5', color: '#aaa', border: '1px solid #e0e0e0', padding: '.1rem .45rem', borderRadius: 2, fontSize: 10, fontWeight: 400 }}>行政區均值</span>
                    }
                    {distDecoded} · {lvrMethod === 'matched' ? '近一年' : '近兩年'}
                  </span>
                </div>

                {/* 核心數字列 */}
                {(lvrAvgWan || estimatedValueWan) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid #e0e8f8' }}>
                  {[
                    {
                      label: estimatedValueWan ? '本物件估值' : '市場均價',
                      value: estimatedValueWan
                        ? `${estimatedValueWan.toLocaleString()} 萬`
                        : (lvrAvgWan ? `${lvrAvgWan.toLocaleString()} 萬` : '—'),
                      sub: ageAdjApplied ? `屋齡調整 ${ageAdjPct > 0 ? '+' : ''}${ageAdjPct}%` : null,
                      accent: true,
                    },
                    {
                      label: `均價（萬/坪）${ageAdjApplied ? '★' : ''}`,
                      value: lvrUnitWanAdj ? `${lvrUnitWanAdj} 萬` : '—',
                      sub: ageAdjApplied ? `原 ${lvrUnitWan} 萬` : null,
                      accent: false,
                    },
                    {
                      label: estimatedValueWan ? '底價比估值' : '底價比市價',
                      value: discountVsEstimated !== null
                        ? (discountVsEstimated > 0 ? `低 ${discountVsEstimated}%` : discountVsEstimated < 0 ? `高 ${Math.abs(discountVsEstimated)}%` : '持平')
                        : '—',
                      accent: discountVsEstimated !== null && discountVsEstimated > 0,
                      green: discountVsEstimated !== null && discountVsEstimated > 0,
                      sub: null,
                    },
                  ].map((s, i, arr) => (
                    <div key={s.label} style={{ padding: '.85rem 1rem', borderRight: i < arr.length - 1 ? '1px solid #e0e8f8' : 'none', textAlign: 'center' }}>
                      <div style={{ fontSize: '.72rem', color: '#8aabdf', letterSpacing: '.06em', marginBottom: '.3rem' }}>{s.label}</div>
                      <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.15rem', fontWeight: 700, color: s.green ? '#3a7d2c' : s.accent ? '#2a5298' : '#444' }}>
                        {s.value}
                      </div>
                      {s.sub && <div style={{ fontSize: '.68rem', color: '#8aabdf', marginTop: '.15rem' }}>{s.sub}</div>}
                    </div>
                  ))}
                </div>
                )}

                {/* 近期成交案例 */}
                {lvrRecent.length > 0 && (
                <div style={{ padding: '.5rem 0' }}>
                  {lvrRecent.map((r: any, i: number) => {
                    const priceWan = r.total_price ? Math.round(r.total_price / 10000) : null;
                    const areaPing = r.area_sqm    ? (Number(r.area_sqm) / 3.30579).toFixed(1) : null;
                    const unitWan  = r.unit_price_sqm ? (Number(r.unit_price_sqm) * 3.30579 / 10000).toFixed(1) : null;
                    return (
                      <div key={i} style={{ padding: '.65rem 1rem', borderBottom: i < lvrRecent.length - 1 ? '1px solid #f0f5ff' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '.82rem', color: '#444', fontWeight: 400, marginBottom: '.2rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {r.address || '（地號）'}
                          </div>
                          <div style={{ display: 'flex', gap: '.75rem', fontSize: '.72rem', color: '#aaa', flexWrap: 'wrap' }}>
                            {r.building_type && <span>{r.building_type}</span>}
                            {areaPing && <span>{areaPing} 坪</span>}
                            {r.bedrooms > 0 && <span>{r.bedrooms}房</span>}
                            {r.floor && <span>{r.floor}</span>}
                            <span>📅 {r.tx_date_iso}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1rem', fontWeight: 700, color: '#2a5298' }}>
                            {priceWan ? `${priceWan.toLocaleString()} 萬` : '—'}
                          </div>
                          {unitWan && <div style={{ fontSize: '.7rem', color: '#aaa', fontWeight: 300 }}>{unitWan} 萬/坪</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                <div style={{ padding: '.6rem 1rem', borderTop: '1px solid #e0e8f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: '#aaa', fontWeight: 300 }}>資料來源：內政部不動產交易實價登錄</span>
                  <a href={`/price/${encodeURIComponent(item.city || cityDecoded)}/${encodeURIComponent(item.district || distDecoded)}`}
                    style={{ fontSize: '.75rem', color: '#2a5298', textDecoration: 'none', fontWeight: 500 }}>
                    查看更多成交記錄 →
                  </a>
                </div>
              </div>
              )}

              {/* 同行政區近期法拍 */}
              {relatedItems.length > 0 && (
              <div style={{ ...cardStyle, marginTop: '1.5rem' }}>
                <SectionHeading>同行政區近期法拍</SectionHeading>
                <div style={{ padding: '.5rem 0' }}>
                  {relatedItems.map((rel: any) => {
                    const relCat = rel.type || '電梯大樓';
                    const relPrice = rel.price ? `${Math.floor(rel.price / 10000).toLocaleString()} 萬` : null;
                    const relHref = `/auction/${encodeURIComponent(rel.city || cityDecoded)}/${encodeURIComponent(rel.district || distDecoded)}/${rel.id}`;
                    return (
                      <Link key={rel.id} href={relHref} className="fp-rel-row">
                        <div>
                          <div style={{ fontSize: '.85rem', color: '#444', fontWeight: 500, fontFamily: "'Noto Serif TC', serif", marginBottom: 4, lineHeight: 1.5 }}>
                            {rel.title?.replace(/-[^-]+[市縣].*$/, '') || rel.address || rel.id}
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: '.78rem', color: '#aaa', fontFamily: "'Noto Sans TC', sans-serif" }}>
                            {rel.auction_date && <span>📅 {rel.auction_date}</span>}
                            {relPrice && <span style={{ color: '#c2632a', fontWeight: 500 }}>{relPrice}</span>}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
              )}

            {/* ━━━━━━ 物件行情解讀 ━━━━━━ */}
            <div style={{ background: '#fff8f4', border: '1px solid #f0c4a0', borderLeft: '4px solid #c2632a', padding: '1.25rem clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
              <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '.92rem', fontWeight: 700, color: '#c2632a', marginTop: 0, marginBottom: '.7rem' }}>
                物件行情解讀
              </h2>
              <p style={{ fontSize: '.82rem', color: '#666', fontWeight: 300, lineHeight: 2.1, margin: 0, fontFamily: "'Noto Sans TC', sans-serif" }}>
                {[
                  item.city && item.district && `此物件位於${item.city}${item.district}`,
                  item.type && `，類型為${item.type}`,
                  r.total_ping && `，總坪數 ${r.total_ping} 坪`,
                  r.floor && `，${r.floor}`,
                  item.layout && `，格局 ${item.layout}`,
                  '。',
                ].filter(Boolean).join('')}
                {priceWan && (
                  <>
                    {' '}本次開標底價為{' '}
                    <strong style={{ color: '#c2632a' }}>{priceWan}</strong>
                    {item.auction_round && <>（{item.auction_round}）</>}
                    {discountVsMarket !== null && discountVsMarket > 0 && (
                      <>，相較於{item.district || distDecoded}近兩年實際成交均價低{' '}
                      <strong style={{ color: '#3a7d2c' }}>{discountVsMarket}%</strong>
                      {lvrAvgWan && <>（區均 {lvrAvgWan.toLocaleString()} 萬）</>}</>
                    )}
                    {'。'}
                  </>
                )}
                {r.delivery_disp && <>
                  {' '}本物件{r.delivery_disp.includes('不') ? '不點交，需自行處理現有占用情形，投標前務必' : '可點交，有助降低後續處理成本，投標前仍建議'}
                  實地勘查並確認產權狀況。
                </>}
                {nextPriceWan && roundNum < 4 && <>
                  {' '}若本次流標，預估下一拍底價約{' '}
                  <strong style={{ color: '#c2632a' }}>{nextPriceWan}</strong>。
                </>}
              </p>
            </div>

            </div>

            {/* ━━━━━━ 右欄（Sticky） ━━━━━━ */}
            <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 1 }}>

              {/* 物件摘要（新增占用情形） */}
              <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.4rem 1.2rem' }}>
                <span style={dimLabelStyle}>物件摘要</span>
                <InfoRow label="底價"     value={priceWan} accent />
                <InfoRow label="保證金"   value={r.deposit} />
                <InfoRow label="每坪單價" value={r.unit_price_str} />
                <InfoRow label="總坪數"   value={r.total_ping ? `${r.total_ping} 坪` : null} />
                <InfoRow label="土地坪數" value={r.land_ping  ? `${r.land_ping} 坪`  : null} />
                <InfoRow label="格局"     value={item.layout} />
                <InfoRow label="屋齡"     value={r.age} />
                <InfoRow label="樓層"     value={r.floor} />
                <InfoRow label="拍次"   value={item.auction_round} />
                <InfoRow label="開標日" value={auctionDatetime || null} accent />
                <InfoRow label="點交"   value={r.delivery_disp} green />
                <InfoRow label="社區"   value={item.community} last />
              </div>

              {/* 代標資訊 */}
              <div style={{ background: '#fff', border: '1px solid #ececec', padding: '1.4rem 1.2rem', marginTop: 1 }}>
                <span style={dimLabelStyle}>代標資訊</span>
                <InfoRow label="代標公司" value={item.company} />
                <InfoRow label="聯絡窗口" value={item.agent} accent last />
              </div>

              {/* 行動按鈕 */}
              <div style={{ background: '#fff8f4', border: '1px solid #f0c4a0', padding: '1.4rem 1.2rem', marginTop: 1 }}>
                <span style={labelStyle}>查詢與投標</span>
                <p style={{ fontSize: '.8rem', color: '#b07340', fontWeight: 300, lineHeight: 1.9, marginBottom: '1.2rem' }}>
                  法拍資訊時常更動，建議至司法院官網確認最新開標資訊與底價。
                </p>
                <a href="https://aomp.judicial.gov.tw/" target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn-primary">
                  前往司法院查詢 →
                </a>
                {(() => {
                  const addr = item.address;
                  if (!addr) return null;
                  const haoIdx = addr.indexOf('號');
                  const normAddr = haoIdx > 0 ? addr.slice(0, haoIdx + 1) : addr;
                  const communityHref = `/community/${encodeURIComponent(item.city || cityDecoded)}/${encodeURIComponent(item.district || distDecoded)}/${encodeURIComponent(normAddr)}`;
                  return (
                    <Link href={communityHref} className="fp-btn" style={{ display: 'block', width: '100%', padding: '.6rem 0', textAlign: 'center', fontSize: '.8rem', fontWeight: 500, fontFamily: "'Noto Sans TC', sans-serif', letterSpacing: '.08em", cursor: 'pointer', textDecoration: 'none', background: '#f0f5ff', color: '#2a5298', border: '1px solid #b8d0f0', borderRadius: 2, marginBottom: 8 }}>
                      📊 查此地址歷年實價成交
                    </Link>
                  );
                })()}
                {relatedPeriods.map(period => (
                  <Link key={period}
                    href={`/land-readjustment/${encodeURIComponent('台中')}/${encodeURIComponent(period)}`}
                    className="fp-btn"
                    style={{ display: 'block', width: '100%', padding: '.6rem 0', textAlign: 'center', fontSize: '.8rem', fontWeight: 500, textDecoration: 'none', background: '#f7f4ff', color: '#7b5ea7', border: '1px solid #c8b8e8', borderRadius: 2, marginBottom: 8, fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: '.08em', cursor: 'pointer' }}>
                    🏗️ 台中{period}重劃區資訊
                  </Link>
                ))}
                {item.url
                  ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn-ghost">查看原始資料來源 ↗</a>
                  : <span className="fp-btn fp-btn-disabled">無原始資料來源</span>}
                <Link href={`/auction/${encodeURIComponent(item.city || cityDecoded)}`} className="fp-btn fp-btn-ghost">
                  ← 返回 {item.city || cityDecoded} 列表
                </Link>
              </div>

              {/* 收藏 / 分享 / 開標提醒 */}
              <ShareButtons
                url={`${BASE}/auction/${encodeURIComponent(item.city || cityDecoded)}/${encodeURIComponent(item.district || distDecoded)}/${id}`}
                title={[
                  item.title?.replace(/-[^-]+[市縣].*$/, '') || item.address || '',
                  priceWan ? `底價 ${priceWan}` : '',
                  r.total_ping ? `${r.total_ping} 坪` : '',
                  displayAuctionDate ? `開標 ${displayAuctionDate}` : '',
                ].filter(Boolean).join('・')}
              />

            </div>
          </div>

        </div>
      </main>
    </>
  );
}