'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LocState = 'idle' | 'locating' | 'error';

// Nominatim reverse geocode → 台灣縣市＋行政區
async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; district: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh-TW`,
    { headers: { 'User-Agent': 'spacelog.tw/1.0' } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.address ?? {};

  // 直轄市：city = 台中市，district = suburb / city_district / quarter
  // 縣：county = 苗栗縣，district = town / village / city_district
  const city     = a.city || a.county || '';
  const district = a.suburb || a.city_district || a.quarter || a.town || a.village || '';

  // 統一 臺→台 前綴，和資料庫對齊
  const normalizeCity = (s: string) => s.replace(/^臺/, '台');

  if (!city || !district) return null;
  return { city: normalizeCity(city), district };
}

export function AddressSearchBox() {
  const [q, setQ]           = useState('');
  const [locState, setLoc]  = useState<LocState>('idle');
  const [locMsg, setLocMsg] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) router.push(`/community/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLoc('error');
      setLocMsg('此裝置不支援定位');
      return;
    }
    setLoc('locating');
    setLocMsg('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (result) {
            router.push(`/price/${encodeURIComponent(result.city)}/${encodeURIComponent(result.district)}`);
          } else {
            setLoc('error');
            setLocMsg('無法辨識行政區，請手動輸入');
          }
        } catch {
          setLoc('error');
          setLocMsg('定位服務暫時無法使用');
        }
      },
      (err) => {
        setLoc('error');
        setLocMsg(err.code === 1 ? '請允許位置存取，再試一次' : '定位失敗，請手動輸入');
      },
      { timeout: 12000, maximumAge: 120000 }
    );
  };

  return (
    <div style={{ width: '100%', maxWidth: 520, margin: '0 auto' }}>
      {/* 搜尋列 */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 0, width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,.08)', borderRadius: 2 }}>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="輸入地址，如：仁愛路一段"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '.75rem .85rem',
            fontSize: '.88rem',
            border: '1px solid #ddd',
            borderRight: 'none',
            borderRadius: '2px 0 0 2px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          style={{
            flexShrink: 0,
            padding: '.75rem 1rem',
            background: '#2a5298',
            color: '#fff',
            border: 'none',
            borderRadius: '0 2px 2px 0',
            fontFamily: 'inherit',
            fontSize: '.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          查歷年成交
        </button>
      </form>

      {/* 定位建議列 */}
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderTop: 'none',
        borderRadius: '0 0 4px 4px',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,.06)',
      }}>
        <button
          type="button"
          onClick={handleLocate}
          disabled={locState === 'locating'}
          style={{
            width: '100%',
            padding: '.65rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: locMsg ? '1px solid #f3f3f3' : 'none',
            cursor: locState === 'locating' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '.83rem',
            color: locState === 'locating' ? '#aaa' : '#2a5298',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '1rem' }}>
            {locState === 'locating' ? '⌛' : '📍'}
          </span>
          <span>
            {locState === 'locating' ? '定位中，請稍候...' : '搜尋目前位置的成交行情'}
          </span>
        </button>

        {locMsg && (
          <div style={{
            padding: '.45rem 1rem',
            fontSize: '.75rem',
            color: '#c0392b',
            background: '#fff5f5',
          }}>
            {locMsg}
          </div>
        )}
      </div>
    </div>
  );
}
