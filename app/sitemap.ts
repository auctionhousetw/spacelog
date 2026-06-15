import { MetadataRoute } from 'next';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://402law.house';
const COMMUNITY_CHUNK = 45000;
const COMMUNITY_ID_START = 3;

// 計算社區頁總數，決定需要幾個 sitemap
export async function generateSitemaps() {
  try {
    const rows = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM (
         SELECT city, district,
           CASE WHEN STRPOS(address,'號') > 0
                THEN SUBSTRING(address,1,STRPOS(address,'號'))
                ELSE address END as addr
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND total_price > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district,
           CASE WHEN STRPOS(address,'號') > 0
                THEN SUBSTRING(address,1,STRPOS(address,'號'))
                ELSE address END
         HAVING COUNT(*) >= 3
       )`
    );
    const count = Number(rows[0]?.count ?? 0);
    const communityPages = Math.max(1, Math.ceil(count / COMMUNITY_CHUNK));
    return [
      { id: 0 }, // 靜態 + 法拍縣市/行政區
      { id: 1 }, // 法拍物件詳情
      { id: 2 }, // 實價縣市/行政區/建物類型/路段
      ...Array.from({ length: communityPages }, (_, i) => ({ id: COMMUNITY_ID_START + i })),
    ];
  } catch {
    return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }];
  }
}

export default async function sitemap(
  props: { id: Promise<string> }
): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  const entries: MetadataRoute.Sitemap = [];

  try {
    if (id === 0) {
      // 靜態頁
      entries.push(
        { url: BASE,                lastModified: new Date(), changeFrequency: 'daily',  priority: 1.0 },
        { url: `${BASE}/auction`,   lastModified: new Date(), changeFrequency: 'daily',  priority: 0.9 },
        { url: `${BASE}/price`,     lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE}/presale`,   lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE}/compare`,   lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
        { url: `${BASE}/listing`,   lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
        { url: `${BASE}/land-readjustment`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${BASE}/land-readjustment/台中`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.75 },
        { url: `${BASE}/special-properties`,   lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
        { url: `${BASE}/special-properties/inherited-land`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.75 },
      );

      // 特殊物件/繼承土地：各行政區頁
      const inheritedDistricts = await prisma.$queryRawUnsafe<{ city: string; district: string }[]>(
        `SELECT DISTINCT city, district FROM inherited_land
         WHERE city IS NOT NULL AND district IS NOT NULL ORDER BY city, district`
      ).catch(() => []);
      for (const r of inheritedDistricts) {
        entries.push({
          url: `${BASE}/special-properties/inherited-land/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }

      // 重劃區各期 Hub 頁（台中 1–16 期）
      const TAICHUNG_PERIODS = ['1期','2期','3期','4期','5期','6期','7期','8期','9期','10期','11期','12期','13期','14期','15期','16期'];
      for (const p of TAICHUNG_PERIODS) {
        entries.push({
          url: `${BASE}/land-readjustment/${encodeURIComponent('台中')}/${encodeURIComponent(p)}`,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }

      // 社區大樓：入口 + 縣市頁 + 行政區頁
      entries.push({ url: `${BASE}/community`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 });

      const commCities = await prisma.$queryRawUnsafe<{ city: string }[]>(
        `SELECT DISTINCT city FROM community_names WHERE city IS NOT NULL AND city != '' ORDER BY city`
      ).catch(() => []);
      for (const { city } of commCities) {
        entries.push({ url: `${BASE}/community/${encodeURIComponent(city)}`, changeFrequency: 'weekly', priority: 0.75 });
      }

      const commDistricts = await prisma.$queryRawUnsafe<{ city: string; district: string }[]>(
        `SELECT city, district FROM community_names
         WHERE city IS NOT NULL AND district IS NOT NULL AND district != ''
           AND LENGTH(district) BETWEEN 2 AND 4
           AND district ~ '[區鎮鄉市]$'
           AND (LENGTH(district) < 4 OR district !~ '[區鎮鄉市][區鎮鄉市]$')
         GROUP BY city, district
         ORDER BY city, district`
      ).catch(() => []);
      for (const r of commDistricts) {
        entries.push({
          url: `${BASE}/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }

      // 法拍縣市頁
      const cities = await prisma.$queryRawUnsafe<{ city: string }[]>(
        `SELECT DISTINCT city FROM houses WHERE city IS NOT NULL AND city != '' ORDER BY city`
      );
      for (const { city } of cities) {
        entries.push({ url: `${BASE}/auction/${encodeURIComponent(city)}`, changeFrequency: 'weekly', priority: 0.8 });
      }

      // 法拍行政區頁
      const districts = await prisma.$queryRawUnsafe<{ city: string; district: string; latest: string }[]>(
        `SELECT city, district, MAX(auction_date) as latest
         FROM houses
         WHERE city IS NOT NULL AND city != ''
           AND district IS NOT NULL AND district != ''
         GROUP BY city, district`
      );
      for (const r of districts) {
        entries.push({
          url: `${BASE}/auction/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`,
          lastModified: r.latest ? new Date(r.latest) : new Date(),
          changeFrequency: 'daily',
          priority: 0.7,
        });
      }

    } else if (id === 1) {
      // 法拍物件詳情（近兩年）
      const houses = await prisma.$queryRawUnsafe<{ id: string; city: string; district: string; auction_date: string }[]>(
        `SELECT id, city, district, auction_date
         FROM houses
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND auction_date >= to_char(CURRENT_DATE - INTERVAL '2 years', 'YYYY-MM-DD')
         ORDER BY auction_date DESC`
      );
      for (const h of houses) {
        entries.push({
          url: `${BASE}/auction/${encodeURIComponent(h.city)}/${encodeURIComponent(h.district)}/${h.id}`,
          lastModified: h.auction_date ? new Date(h.auction_date) : new Date(),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }

    } else if (id === 2) {
      // 實價縣市頁
      const lvrCities = await prisma.$queryRawUnsafe<{ city: string }[]>(
        `SELECT DISTINCT city FROM lvr_land WHERE city IS NOT NULL AND city != '' ORDER BY city`
      ).catch(() => []);
      for (const { city } of lvrCities) {
        entries.push({ url: `${BASE}/price/${encodeURIComponent(city)}`, changeFrequency: 'monthly', priority: 0.7 });
      }

      // 實價行政區頁
      const lvrDistricts = await prisma.$queryRawUnsafe<{ city: string; district: string }[]>(
        `SELECT DISTINCT city, district FROM lvr_land
         WHERE city IS NOT NULL AND city != ''
           AND district IS NOT NULL AND district != ''
         ORDER BY city, district`
      ).catch(() => []);
      for (const r of lvrDistricts) {
        entries.push({
          url: `${BASE}/price/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`,
          changeFrequency: 'monthly',
          priority: 0.65,
        });
      }

      // 實價建物類型子頁
      const lvrTypes = await prisma.$queryRawUnsafe<{ city: string; district: string; building_type: string }[]>(
        `SELECT DISTINCT city, district, building_type FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND building_type IS NOT NULL AND building_type != ''
         ORDER BY city, district, building_type`
      ).catch(() => []);
      for (const r of lvrTypes) {
        entries.push({
          url: `${BASE}/price/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.building_type)}`,
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }

      // 實價熱門路段頁（至少 5 筆成交）
      const lvrRoads = await prisma.$queryRawUnsafe<{ city: string; district: string; road_name: string }[]>(
        `SELECT city, district,
                CASE
                  WHEN STRPOS(address,'路') > 0
                    AND (STRPOS(address,'街')=0 OR STRPOS(address,'路')<=STRPOS(address,'街'))
                    THEN SUBSTRING(address,1,STRPOS(address,'路'))
                  WHEN STRPOS(address,'街') > 0
                    THEN SUBSTRING(address,1,STRPOS(address,'街'))
                  ELSE NULL
                END as road_name,
                COUNT(*) as n
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND unit_price_sqm > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district,
                  CASE
                    WHEN STRPOS(address,'路') > 0
                      AND (STRPOS(address,'街')=0 OR STRPOS(address,'路')<=STRPOS(address,'街'))
                      THEN SUBSTRING(address,1,STRPOS(address,'路'))
                    WHEN STRPOS(address,'街') > 0
                      THEN SUBSTRING(address,1,STRPOS(address,'街'))
                    ELSE NULL
                  END
         HAVING COUNT(*) >= 5
         ORDER BY city, district, COUNT(*) DESC`
      ).catch(() => []);
      for (const r of lvrRoads) {
        entries.push({
          url: `${BASE}/price/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/road/${encodeURIComponent(r.road_name)}`,
          changeFrequency: 'monthly',
          priority: 0.55,
        });
      }

      // 預售屋：縣市頁
      const presaleCities = await prisma.$queryRawUnsafe<{ city: string }[]>(
        `SELECT DISTINCT city FROM lvr_presale WHERE city IS NOT NULL AND city != '' ORDER BY city`
      ).catch(() => []);
      for (const { city } of presaleCities) {
        entries.push({ url: `${BASE}/presale/${encodeURIComponent(city)}`, changeFrequency: 'monthly', priority: 0.7 });
      }

      // 預售屋：行政區頁
      const presaleDistricts = await prisma.$queryRawUnsafe<{ city: string; district: string }[]>(
        `SELECT DISTINCT city, district FROM lvr_presale
         WHERE city IS NOT NULL AND district IS NOT NULL ORDER BY city, district`
      ).catch(() => []);
      for (const r of presaleDistricts) {
        entries.push({ url: `${BASE}/presale/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}`, changeFrequency: 'monthly', priority: 0.65 });
      }

      // 預售屋：建案頁
      const presaleProjects = await prisma.$queryRawUnsafe<{ city: string; district: string; project_name: string }[]>(
        `SELECT DISTINCT city, district, project_name FROM lvr_presale
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND project_name IS NOT NULL AND project_name != ''
         ORDER BY city, district`
      ).catch(() => []);
      for (const r of presaleProjects) {
        entries.push({
          url: `${BASE}/presale/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.project_name)}`,
          changeFrequency: 'monthly', priority: 0.6,
        });
      }

    } else {
      // 社區/物件歷史頁（id >= 3），每頁 COMMUNITY_CHUNK 筆
      const page = id - COMMUNITY_ID_START;
      const offset = page * COMMUNITY_CHUNK;
      const communities = await prisma.$queryRawUnsafe<{ city: string; district: string; addr: string }[]>(
        `SELECT city, district,
                CASE WHEN STRPOS(address,'號') > 0
                     THEN SUBSTRING(address,1,STRPOS(address,'號'))
                     ELSE address END as addr
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND total_price > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district,
                  CASE WHEN STRPOS(address,'號') > 0
                       THEN SUBSTRING(address,1,STRPOS(address,'號'))
                       ELSE address END
         HAVING COUNT(*) >= 3
         ORDER BY COUNT(*) DESC
         LIMIT ${COMMUNITY_CHUNK} OFFSET ${offset}`
      ).catch(() => []);
      for (const r of communities) {
        entries.push({
          url: `${BASE}/community/${encodeURIComponent(r.city)}/${encodeURIComponent(r.district)}/${encodeURIComponent(r.addr)}`,
          changeFrequency: 'monthly',
          priority: 0.55,
        });
      }
    }

  } catch { /* DB 未就緒時靜默失敗 */ }

  return entries;
}
