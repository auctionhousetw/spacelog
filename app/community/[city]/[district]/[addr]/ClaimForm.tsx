'use client';
import { useState } from 'react';

export default function ClaimForm({
  city, district, communityName,
}: {
  city: string; district: string; communityName: string;
}) {
  const [role, setRole] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !contact) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, district, communityName, role, contact, note }),
      });
      const data = await res.json();
      setStatus(data.success ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <div style={{ margin: '2rem 0 1.5rem', padding: '1.5rem', background: '#f0f9f4', border: '1px solid #b6e0c8', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '.4rem' }}>✅</div>
        <div style={{ fontWeight: 600, color: '#1a6b3a', marginBottom: '.3rem' }}>已收到您的申請</div>
        <div style={{ fontSize: '.78rem', color: '#888' }}>我們會盡快與您聯繫，確認後開放頁面編輯權限。</div>
      </div>
    );
  }

  return (
    <div style={{ margin: '2rem 0 1.5rem', padding: '1.25rem 1.5rem', background: '#fafafa', border: '1px solid #ececec' }}>
      <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#444', marginBottom: '.9rem' }}>
        認領此頁面，補充社區資訊
      </div>
      <div style={{ fontSize: '.75rem', color: '#aaa', marginBottom: '1rem' }}>
        您是此社區的管委會成員、住戶或在地房仲？填寫後我們會聯繫您開放編輯權限。
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '.75rem' }}>
          <label style={{ fontSize: '.78rem', color: '#666', display: 'block', marginBottom: '.3rem' }}>您的身份 *</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            required
            style={{ width: '100%', padding: '.5rem .75rem', border: '1px solid #ddd', background: '#fff', fontSize: '.82rem', color: '#333' }}
          >
            <option value="">請選擇</option>
            <option value="管委會成員">管委會成員</option>
            <option value="在地房仲">在地房仲</option>
            <option value="住戶">住戶</option>
            <option value="其他">其他</option>
          </select>
        </div>

        <div style={{ marginBottom: '.75rem' }}>
          <label style={{ fontSize: '.78rem', color: '#666', display: 'block', marginBottom: '.3rem' }}>聯絡方式（電話或 LINE）*</label>
          <input
            type="text"
            value={contact}
            onChange={e => setContact(e.target.value)}
            placeholder="例：0912345678 或 LINE ID"
            required
            style={{ width: '100%', padding: '.5rem .75rem', border: '1px solid #ddd', background: '#fff', fontSize: '.82rem', color: '#333', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '.78rem', color: '#666', display: 'block', marginBottom: '.3rem' }}>想補充或修正的內容（選填）</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="例：管理費每月 2,500 元、有地下停車場、電梯 2 台…"
            rows={3}
            style={{ width: '100%', padding: '.5rem .75rem', border: '1px solid #ddd', background: '#fff', fontSize: '.82rem', color: '#333', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        {status === 'error' && (
          <div style={{ fontSize: '.75rem', color: '#c0392b', marginBottom: '.75rem' }}>送出失敗，請稍後再試。</div>
        )}

        <button
          type="submit"
          disabled={status === 'loading' || !role || !contact}
          style={{
            padding: '.65rem 1.75rem', background: status === 'loading' ? '#aaa' : '#2a5298',
            color: '#fff', fontSize: '.85rem', fontWeight: 600, border: 'none', cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'loading' ? '送出中…' : '送出申請'}
        </button>
        <div style={{ fontSize: '.7rem', color: '#ccc', marginTop: '.55rem' }}>免費 · 資料由您主導</div>
      </form>
    </div>
  );
}
