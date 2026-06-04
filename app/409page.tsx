// 指向您專案中實際生成的 Prisma Client 路徑
import { PrismaClient } from './generated/prisma';

/**
 * Prisma Singleton 模式
 * 確保在 Next.js 開發模式下，熱更新不會導致產生過多的資料庫連線。
 */
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ['error'], 
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

interface HomeProps {
  searchParams: Promise<{ city?: string; page?: string; sort?: string }>;
}

/**
 * 法拍屋智慧搜尋系統首頁 (進階版)
 * 包含：縣市篩選、分頁機制、價格/日期排序
 */
export default async function Home({ searchParams }: HomeProps) {
  // 1. 取得網址參數 (Next.js 15+ 必須 await)
  const params = await searchParams;
  const city = params.city || '台中市';
  const page = parseInt(params.page || '1', 10);
  const sort = params.sort || 'date'; // 'date' | 'price'
  
  const pageSize = 30; // 每頁顯示 30 筆，兼顧效能與畫面豐富度

  let houses: any[] = [];
  let totalCount = 0;
  let errorMsg = '';

  try {
    // 2. 決定排序邏輯
    const orderBy: any = sort === 'price' 
      ? { price: 'asc' }        // 依底價由低到高
      : { auction_date: 'asc' }; // 依開標日由近到遠

    // 3. 並行執行查詢 (Promise.all 提升效能)：同時抓取「當頁資料」與「該縣市總筆數」
    const [fetchedHouses, count] = await Promise.all([
      prisma.houses.findMany({
        where: { city: city },
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: orderBy,
      }),
      prisma.houses.count({
        where: { city: city },
      })
    ]);

    houses = fetchedHouses;
    totalCount = count;
  } catch (e: any) {
    console.error('資料庫讀取異常:', e);
    errorMsg = '目前無法載入資料，請確認資料庫狀態與連線設定。';
  }

  // 計算總頁數
  const totalPages = Math.ceil(totalCount / pageSize);
  const cities = ["台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市"];

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-700 pb-20">
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-20">
        
        {/* 核心導航與標題 */}
        <header className="mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-black tracking-widest text-blue-600 bg-blue-50 rounded-lg border border-blue-100 uppercase">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            Foreclosure Data Engine v2.0
          </div>
          <h1 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter text-slate-900 leading-[1.1]">
            找尋<span className="text-blue-600">低於市價</span>的<br/>房地產機會
          </h1>
          <p className="text-slate-500 text-xl max-w-2xl leading-relaxed font-medium">
            全台資料庫現有 <span className="text-slate-900 font-bold underline decoration-blue-500 decoration-4 underline-offset-4">6,302</span> 筆不重複案件，支援即時價格排序與分頁檢索。
          </p>
        </header>

        {/* 縣市快速切換標籤 (切換縣市時自動回到第一頁) */}
        <section className="mb-16">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6">
            熱門標的區域
          </h3>
          <div className="flex flex-wrap gap-3">
            {cities.map((c) => (
              <a
                key={c}
                href={`/?city=${c}&sort=${sort}`}
                className={`px-10 py-4 rounded-2xl font-black text-sm transition-all duration-300 border-2 ${
                  city === c
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xl shadow-slate-200 scale-105'
                    : 'bg-white text-slate-500 border-slate-100 hover:border-blue-200 hover:text-blue-600 hover:shadow-xl'
                }`}
              >
                {c}
              </a>
            ))}
          </div>
        </section>

        {/* 系統狀態警告 */}
        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 p-8 mb-16 rounded-r-3xl shadow-sm text-red-700">
            <h3 className="text-xl font-black mb-2">系統錯誤</h3>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* 排序與統計列 */}
        <section>
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-10 border-b-2 border-slate-100 pb-8 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-4 h-12 bg-blue-600 rounded-full"></div>
              <div>
                <h2 className="text-3xl font-black text-slate-900">
                  {city} 精選案件
                </h2>
                <p className="text-slate-500 font-medium mt-1">
                  共找到 {totalCount} 筆資料 (第 {page}/{totalPages || 1} 頁)
                </p>
              </div>
            </div>

            {/* 排序按鈕 */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <a 
                href={`/?city=${city}&sort=date`}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  sort === 'date' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                ⏰ 依開標日
              </a>
              <a 
                href={`/?city=${city}&sort=price`}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  sort === 'price' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                💰 依總底價
              </a>
            </div>
          </div>

          {/* 房產物件網格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {houses.length > 0 ? (
              houses.map((house) => (
                <div 
                  key={house.id} 
                  className="group bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 flex flex-col"
                >
                  <div className="p-10 flex-1">
                    <div className="flex justify-between items-center mb-6">
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest border border-blue-100">
                        {house.type || '房屋'}
                      </span>
                      <span className="text-slate-300 font-bold text-[10px] font-mono tracking-tighter">
                        {house.case_number || '確認中'}
                      </span>
                    </div>
                    
                    <h4 className="text-2xl font-black text-slate-900 mb-6 line-clamp-2 min-h-[4rem] group-hover:text-blue-600 transition-colors leading-tight">
                      {house.title}
                    </h4>
                    
                    <div className="space-y-5 text-slate-500 font-medium">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-xl shrink-0">📍</div>
                        <span className="line-clamp-2 pt-1">{house.district} {house.address?.replace(house.city, '').replace(house.district, '')}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-xl shrink-0">📐</div>
                        <span>總登記坪數 <strong className="text-slate-900">{house.area}</strong> 坪</span>
                      </div>
                    </div>
                  </div>

                  {/* 價格資訊區塊 */}
                  <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 backdrop-blur-sm">
                    <div className="flex justify-between items-end mb-8">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-[0.2em]">拍賣底價</p>
                        <p className="text-4xl font-black text-blue-600 tracking-tighter">
                          {Math.floor((house.price || 0) / 10000)}<span className="text-sm ml-1 font-bold">萬</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-[0.2em]">單價 (萬/坪)</p>
                        <p className="text-xl font-bold text-slate-700 underline decoration-slate-200 decoration-2 underline-offset-4">{house.unit_price || '0.0'}</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1 bg-white border-2 border-orange-100 text-orange-600 py-4 rounded-[1.5rem] text-center text-xs font-black shadow-sm group-hover:border-orange-300 transition-all">
                        📅 {house.auction_date || '更新中'}
                      </div>
                      <a 
                        href={`/${encodeURIComponent(house.type || '未分類')}/${encodeURIComponent(house.city || '未知縣市')}/${encodeURIComponent(house.district || '未知區域')}/${house.id}`}
                        className="px-6 bg-slate-900 text-white hover:bg-blue-600 rounded-[1.5rem] flex items-center justify-center transition-all shadow-xl shadow-slate-200 active:scale-95"
                        title="查看物件詳情"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 shadow-inner">
                <div className="text-7xl mb-8">🔍</div>
                <p className="text-slate-900 font-black text-2xl mb-2">此區域或此頁數目前無公開資料</p>
                <p className="text-slate-400 font-medium">請嘗試切換條件，或返回首頁。</p>
              </div>
            )}
          </div>

          {/* 分頁按鈕區 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 md:gap-8 mt-16">
              {page > 1 ? (
                <a 
                  href={`/?city=${city}&sort=${sort}&page=${page - 1}`}
                  className="px-6 md:px-8 py-3 md:py-4 rounded-2xl font-black text-sm bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm"
                >
                  &larr; 上一頁
                </a>
              ) : (
                <div className="px-6 md:px-8 py-3 md:py-4 rounded-2xl font-black text-sm bg-slate-50 border-2 border-slate-100 text-slate-300 cursor-not-allowed">
                  &larr; 上一頁
                </div>
              )}
              
              <div className="text-slate-400 font-bold tracking-widest text-sm md:text-base">
                PAGE <span className="text-slate-900 text-xl mx-1">{page}</span> OF {totalPages}
              </div>

              {page < totalPages ? (
                <a 
                  href={`/?city=${city}&sort=${sort}&page=${page + 1}`}
                  className="px-6 md:px-8 py-3 md:py-4 rounded-2xl font-black text-sm bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm"
                >
                  下一頁 &rarr;
                </a>
              ) : (
                <div className="px-6 md:px-8 py-3 md:py-4 rounded-2xl font-black text-sm bg-slate-50 border-2 border-slate-100 text-slate-300 cursor-not-allowed">
                  下一頁 &rarr;
                </div>
              )}
            </div>
          )}

        </section>
      </div>
    </main>
  );
}