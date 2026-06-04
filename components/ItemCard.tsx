import Link from 'next/link';

export default function ItemCard({ data }: { data: any }) {
  const idMatch = data.url?.match(/-([a-zA-Z0-9]+)\.html?/i);
  const itemId = data.id ?? (idMatch ? idMatch[1] : 'not-found');

  const [cat, city, dist] = data.breadcrumbs ?? ['法拍屋', '台中市', '大肚區'];

  const type = data.specs_raw?.['類型'] || '法拍物件';
  const layout = data.layout || data.specs_raw?.['格局'] || '';
  const ping = data.total_ping || data.specs_raw?.['總登記坪數'] || '';
  const age = data.specs_raw?.['屋齡'] || '';
  const floor = data.specs_raw?.['所在樓層'] || '';
  const address = data.specs_raw?.['地址'] || data.address || '';
  
  const round = data.specs_raw?.['拍次'] || data.specs_raw?.['目前拍次'] || '應買';
  const status = data.specs_raw?.['銷售狀態'] || '待標中';

  const specItems = [type, layout, ping ? `權狀${ping}` : '', age, floor].filter(Boolean);

  return (
    <Link
      href={`/${encodeURIComponent(cat)}/${encodeURIComponent(city)}/${encodeURIComponent(dist)}/${itemId}`}
      // 🔥 強制改為 flex-row 橫向排列，一列只會有這一個長條卡片 🔥
      className="group flex flex-row items-stretch bg-white border border-gray-200 hover:bg-orange-50/50 hover:border-orange-300 transition-all p-4 gap-5 rounded-sm"
    >
      {/* ── 左側：圖片區 (固定寬度 200px) ── */}
      <div className="w-[200px] h-[150px] bg-gray-100 relative flex-shrink-0 overflow-hidden rounded-sm border border-gray-100">
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          暫無圖片
        </div>
        <div className="absolute top-0 left-0 bg-red-500 text-white text-[12px] px-2 py-0.5">
          {status}
        </div>
        <div className="absolute bottom-0 left-0 bg-black/70 text-white text-[12px] px-2 py-0.5">
          {round}
        </div>
      </div>

      {/* ── 中間：文字詳細資訊 (自動延伸填滿) ── */}
      <div className="flex-grow flex flex-col py-1 overflow-hidden">
        <h3 className="text-[18px] font-bold text-gray-800 group-hover:text-orange-600 transition-colors mb-2 truncate">
          {data.title || address}
        </h3>
        
        <div className="text-[14px] text-gray-600 mb-2 flex items-center gap-2 truncate">
          {specItems.map((item, index) => (
            <span key={index} className="flex items-center">
              {item}
              {index < specItems.length - 1 && <span className="mx-2 text-gray-300">|</span>}
            </span>
          ))}
        </div>

        <div className="text-[14px] text-gray-500 mb-3 truncate">
          <span className="font-medium text-gray-700 mr-2">{city}{dist}</span> 
          {address.replace(city, '').replace(dist, '')}
        </div>

        <div className="flex gap-2 mt-auto">
          <span className="bg-gray-100 text-gray-500 text-[12px] px-2 py-1 border border-gray-200">點交保障</span>
          <span className="bg-orange-50 text-orange-600 text-[12px] px-2 py-1 border border-orange-200">法拍專員精選</span>
        </div>
      </div>

      {/* ── 右側：價格區 (固定在最右邊) ── */}
      <div className="w-[140px] flex flex-col items-end py-1 flex-shrink-0">
        <div className="text-red-600 font-bold flex items-baseline gap-1">
          <span className="text-[28px] tracking-tight">{data.price?.replace('售', '')?.replace('萬', '') || '—'}</span>
          <span className="text-[14px]">萬</span>
        </div>
        {data.specs_raw?.['每坪單價'] && (
          <div className="text-[13px] text-gray-500 mt-1">
            {data.specs_raw['每坪單價']}
          </div>
        )}
      </div>
    </Link>
  );
}