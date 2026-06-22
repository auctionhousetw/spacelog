'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, background: '#f7f6f3', fontFamily: '"PingFang TC","Microsoft JhengHei",sans-serif', color: '#333' }}>
        <div style={{ maxWidth: 580, margin: '0 auto', padding: '5rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>⚙️</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#222', marginBottom: '.75rem' }}>
            系統暫時無法使用
          </h1>
          <p style={{ fontSize: '.95rem', color: '#666', lineHeight: 1.85, marginBottom: '2rem' }}>
            網站目前正在進行維護，請稍後再試。<br />
            感謝您的耐心等候。
          </p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{ background: '#ad5620', color: '#fff', border: 'none', padding: '.65rem 1.5rem', borderRadius: 2, fontSize: '.9rem', fontWeight: 500, cursor: 'pointer' }}
            >
              重新載入
            </button>
            <a
              href="/"
              style={{ background: '#fff', color: '#555', border: '1px solid #ddd', padding: '.65rem 1.5rem', borderRadius: 2, fontSize: '.9rem', textDecoration: 'none' }}
            >
              回首頁
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
