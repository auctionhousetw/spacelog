'use client';

export const revalidate = 86400;

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { WatchItem } from '@/components/ShareButtons';

const WL_KEY = 'fp_watchlist';

export default function WatchlistPage() {
  const [items,   setItems]   = useState<WatchItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { setItems(JSON.parse(localStorage.getItem(WL_KEY) || '[]')); }
    catch { setItems([]); }
  }, []);

  const remove = (id: string) => {
    const next = items.filter(x => x.id !== id);
    setItems(next);
    localStorage.setItem(WL_KEY, JSON.stringify(next));
  };

  const clearAll = () => {
    setItems([]);
    localStorage.removeItem(WL_KEY);
  };

  const fmtWan = (p: number | null | undefined) =>
    p ? `${Math.floor(p / 10000).toLocaleString()} 萬` : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; }
        .wl-card { display: block; background: #fff; border: 1px solid #ececec; text-decoration: none; color: inherit; transition: box-shadow .15s; margin-bottom: 1px; }
        .wl-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.07); }
        .wl-card:hover .wl-title { color: #c2632a; }
        .wl-title { font-family: 'Noto Serif TC', serif; font-size: .95rem; font-weight: 500; color: #333; line-height: 1.55; transition: color .15s; }
        .wl-remove { background: none; border: none; cursor: pointer; font-size: .75rem; color: #ccc; padding: .3rem .5rem; border-radius: 2px; font-family: 'Noto Sans TC', sans-serif; transition: all .15s; }
        .wl-remove:hover { color: #b03a3a; background: #fff4f4; }
        .fp-crumb { color: #bbb; font-size: 11px; text-decoration: none; transition: color .15s; }
        .fp-crumb:hover { color: #c2632a; }
      `}</style>

      <main style={{ minHeight: '100vh', background: '#f7f6f3', fontFamily: "'Noto Sans TC', sans-serif", paddingBottom: '6rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(1rem,3vw,1.75rem)' }}>

          {/* 麵包屑 */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.4rem 0 1rem', fontSize: 11 }}>
            <Link href="/" className="fp-crumb">首頁</Link>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <Link href="/auction" className="fp-crumb">法拍屋</Link>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#888' }}>我的收藏清單</span>
          </nav>

          {/* 標題 */}
          <div style={{ background: '#fff', borderTop: '1px solid #ececec', borderBottom: '1px solid #ececec', padding: 'clamp(1.5rem,4vw,2.25rem) clamp(1.25rem,4vw,2rem)', marginBottom: 1 }}>
            <p style={{ fontSize: '.75rem', fontWeight: 500, letterSpacing: '.2em', color: '#c2632a', marginBottom: '.5rem' }}>
              WATCHLIST
            </p>
            <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.3rem,4vw,1.75rem)', fontWeight: 700, color: '#222', lineHeight: 1.5, marginBottom: '.5rem' }}>
              我的法拍收藏清單
            </h1>
            {mounted && (
              <p style={{ fontSize: '.85rem', color: '#aaa', fontWeight: 300, margin: 0 }}>
                {items.length > 0
                  ? `共收藏 ${items.length} 筆物件・資料儲存於瀏覽器本機，清除快取後將消失`
                  : '目前尚無收藏物件'}
              </p>
            )}
          </div>

          {/* 清除全部 */}
          {mounted && items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '.75rem 0', marginBottom: '.25rem' }}>
              <button onClick={clearAll} style={{
                background: 'none', border: '1px solid #e0e0e0', borderRadius: 2,
                padding: '.35rem .85rem', fontSize: '.78rem', color: '#aaa', cursor: 'pointer',
                fontFamily: "'Noto Sans TC', sans-serif", transition: 'all .15s',
              }}
                onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = '#b03a3a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#f0b0b0'; }}
                onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e0e0e0'; }}
              >
                清除全部收藏
              </button>
            </div>
          )}

          {/* 物件列表 */}
          {!mounted ? null : items.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #ececec', padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: .2 }}>📌</div>
              <p style={{ fontSize: '.9rem', color: '#888', margin: '0 0 1.25rem', fontWeight: 300 }}>
                還沒有收藏任何物件
              </p>
              <Link href="/auction" style={{
                display: 'inline-block', padding: '.55rem 1.5rem', background: '#c2632a',
                color: '#fff', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none',
                borderRadius: 2, fontFamily: "'Noto Sans TC', sans-serif",
              }}>
                瀏覽法拍物件 →
              </Link>
            </div>
          ) : (
            <div>
              {items.map(item => {
                const priceWan = fmtWan(item.price ?? null);
                const isDelivery = item.delivery && !item.delivery.includes('不');
                return (
                  <div key={item.id} style={{ position: 'relative' }}>
                    <a href={item.url} className="wl-card">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '.9rem clamp(1rem,3vw,1.5rem)', alignItems: 'start' }}>
                        <div>
                          {/* badges */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '.4rem' }}>
                            {item.city && item.district && (
                              <span style={{ fontSize: 10, background: '#fff3ee', color: '#c2632a', border: '1px solid #f0c4a0', padding: '.15rem .5rem', borderRadius: 1 }}>
                                {item.city}{item.district}
                              </span>
                            )}
                            {isDelivery && (
                              <span style={{ fontSize: 10, background: '#f4fbf0', color: '#3a7d2c', border: '1px solid #b5dba5', padding: '.15rem .5rem', borderRadius: 1 }}>
                                ✓ {item.delivery}
                              </span>
                            )}
                          </div>
                          <div className="wl-title">{item.title || item.address || item.id}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem 1rem', marginTop: '.35rem' }}>
                            {item.address && (
                              <span style={{ fontSize: '.78rem', color: '#aaa', fontWeight: 300 }}>📍 {item.address}</span>
                            )}
                            {item.auction_date && (
                              <span style={{ fontSize: '.78rem', color: '#aaa', fontWeight: 300 }}>📅 開標 {item.auction_date}</span>
                            )}
                          </div>
                          {item.saved_at && (
                            <div style={{ fontSize: '.68rem', color: '#ddd', marginTop: '.4rem' }}>
                              收藏於 {new Date(item.saved_at).toLocaleDateString('zh-TW')}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {priceWan && (
                            <div style={{ fontFamily: "'Noto Serif TC', serif", fontSize: '1.2rem', fontWeight: 700, color: '#c2632a', lineHeight: 1.2 }}>
                              {priceWan}
                            </div>
                          )}
                          <div style={{ fontSize: '.72rem', color: '#ccc', marginTop: '.2rem' }}>拍賣底價</div>
                        </div>
                      </div>
                    </a>
                    {/* 刪除按鈕（疊在卡片右下） */}
                    <button className="wl-remove" onClick={() => remove(item.id)}
                      style={{ position: 'absolute', bottom: 10, right: 12 }}>
                      ✕ 移除
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 注意事項 */}
          {mounted && items.length > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '.85rem 1.25rem', background: '#fafafa', border: '1px solid #ececec', borderRadius: 2 }}>
              <p style={{ fontSize: '.75rem', color: '#bbb', fontWeight: 300, margin: 0, lineHeight: 1.9 }}>
                ⚠️ 收藏資料儲存於您的瀏覽器本機（localStorage），清除瀏覽器資料後將消失。<br />
                本頁不需要登入，但換裝置或換瀏覽器後收藏紀錄不會同步。
              </p>
            </div>
          )}

        </div>
      </main>
    </>
  );
}
