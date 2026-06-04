import { MetadataRoute } from 'next';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';
const COMMUNITY_CHUNK = 45000;
const COMMUNITY_ID_START = 3;

// 計算社區頁總數，決定需要幾個 sitemap
export async function generateSitemaps() {
  try {
    const rows = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM (
         SELECT city, district,
           CASE WHEN instr(address,'號') > 0
                THEN substr(address,1,instr(address,'號'))
                ELSE address END as addr
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND total_price > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district, addr
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
      );

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
           AND auction_date >= date('now', '-2 years')
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
                  WHEN instr(address,'路') > 0
                    AND (instr(address,'街')=0 OR instr(address,'路')<=instr(address,'街'))
                    THEN substr(address,1,instr(address,'路'))
                  WHEN instr(address,'街') > 0
                    THEN substr(address,1,instr(address,'街'))
                  ELSE NULL
                END as road_name,
                COUNT(*) as n
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND unit_price_sqm > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district, road_name
         HAVING n >= 5 AND road_name IS NOT NULL AND road_name != ''
         ORDER BY city, district, n DESC`
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
                CASE WHEN instr(address,'號') > 0
                     THEN substr(address,1,instr(address,'號'))
                     ELSE address END as addr
         FROM lvr_land
         WHERE city IS NOT NULL AND district IS NOT NULL
           AND tx_type LIKE '%建物%' AND total_price > 0
           AND address IS NOT NULL AND address != ''
         GROUP BY city, district, addr
         HAVING COUNT(*) >= 3 AND addr IS NOT NULL AND addr != ''
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
