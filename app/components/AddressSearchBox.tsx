'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddressSearchBox() {
  const [q, setQ] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) {
      router.push(`/community/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 0, maxWidth: 520, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,.08)', borderRadius: 2 }}>
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="輸入地址查歷年成交，如：台北市大安區仁愛路一段"
        style={{
          flex: 1,
          padding: '.75rem 1rem',
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
          padding: '.75rem 1.25rem',
          background: '#2a5298',
          color: '#fff',
          border: 'none',
          borderRadius: '0 2px 2px 0',
          fontFamily: 'inherit',
          fontSize: '.88rem',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        查歷年成交
      </button>
    </form>
  );
}
