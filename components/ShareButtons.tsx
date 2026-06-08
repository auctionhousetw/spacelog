'use client';

import { useState } from 'react';

interface ShareButtonsProps {
  url: string;
  title: string;
}

export default function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const baseBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 2, padding: '.6rem 0', fontSize: '.8rem', fontWeight: 500,
    fontFamily: "'Noto Sans TC', sans-serif", letterSpacing: '.05em',
    cursor: 'pointer', textDecoration: 'none', width: '100%',
    transition: 'opacity .15s',
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #ececec',
      padding: '1.1rem 1.2rem', marginTop: 1,
    }}>
      {/* 收藏 / 開標提醒 小按鈕 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          { icon: '📌', label: '收藏' },
          { icon: '🔔', label: '開標提醒' },
        ].map(b => (
          <button key={b.label} style={{
            background: 'none', border: '1px solid #ececec', borderRadius: 2,
            padding: '.5rem .25rem', fontSize: '.75rem', color: '#aaa',
            cursor: 'pointer', fontFamily: "'Noto Sans TC', sans-serif",
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 16 }}>{b.icon}</span>
            <span>{b.label}</span>
          </button>
        ))}
      </div>

      {/* 分享區標題 */}
      <span style={{
        display: 'block', fontSize: 9.5, fontWeight: 500,
        letterSpacing: '.2em', textTransform: 'uppercase',
        color: '#ccc', fontFamily: "'Noto Sans TC', sans-serif",
        marginBottom: '0.65rem',
      }}>
        分享物件
      </span>

      {/* LINE 分享（主要，全寬） */}
      <a
        href={lineShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...baseBtn,
          background: '#06C755', color: '#fff', border: 'none',
          marginBottom: 6,
        }}
      >
        {/* LINE icon */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.07 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
        </svg>
        分享到 LINE
      </a>

      {/* Facebook + 複製連結（並排小按鈕） */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <a
          href={fbShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...baseBtn,
            background: '#1877F2', color: '#fff', border: 'none',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Facebook
        </a>
        <button
          onClick={handleCopy}
          style={{
            ...baseBtn,
            background: 'none',
            color: copied ? '#3a7d2c' : '#888',
            border: `1px solid ${copied ? '#b5dba5' : '#ddd'}`,
          }}
        >
          {copied ? '✓ 已複製' : '🔗 複製連結'}
        </button>
      </div>
    </div>
  );
}
