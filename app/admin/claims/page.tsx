'use client';
import { useEffect, useState } from 'react';

interface Claim {
  id: number;
  city: string;
  district: string;
  community_name: string;
  role: string;
  contact: string;
  note: string;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  '待處理': '#f59e0b',
  '已聯繫': '#3b82f6',
  '已確認': '#10b981',
  '已婉拒': '#ef4444',
};

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => { fetchClaims(); }, []);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/claims');
      const data = await res.json();
      setClaims(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await fetch(`/api/admin/claims/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setClaims(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    } finally {
      setUpdating(null);
    }
  };

  const pending = claims.filter(c => c.status === '待處理');
  const displayed = tab === 'pending' ? pending : claims;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>社區認領申請管理</h1>
          {pending.length > 0 && (
            <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: '.8rem', fontWeight: 600 }}>
              {pending.length} 筆待處理
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          {(['pending', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.45rem 1.2rem', fontSize: '.85rem', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: tab === t ? '#2a5298' : '#e5e7eb',
                color: tab === t ? '#fff' : '#444',
              }}
            >
              {t === 'pending' ? `待處理（${pending.length}）` : `全部（${claims.length}）`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>載入中…</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa', background: '#fff' }}>無資料</div>
        ) : (
          <div style={{ background: '#fff', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['社區', '城市/區', '身份', '聯絡方式', '備註', '狀態', '操作', '時間'].map(h => (
                    <th key={h} style={{ padding: '.7rem .9rem', textAlign: 'left', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0', background: c.status === '待處理' ? '#fffbeb' : undefined }}>
                    <td style={{ padding: '.65rem .9rem', fontWeight: 500, maxWidth: 180 }}>{c.community_name}</td>
                    <td style={{ padding: '.65rem .9rem', whiteSpace: 'nowrap' }}>{c.city}{c.district}</td>
                    <td style={{ padding: '.65rem .9rem' }}>{c.role}</td>
                    <td style={{ padding: '.65rem .9rem', fontFamily: 'monospace' }}>{c.contact}</td>
                    <td style={{ padding: '.65rem .9rem', maxWidth: 200, color: '#666' }}>{c.note || '—'}</td>
                    <td style={{ padding: '.65rem .9rem' }}>
                      <span style={{
                        background: STATUS_COLORS[c.status] ?? '#6b7280',
                        color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: '.75rem', fontWeight: 600,
                      }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '.65rem .9rem', whiteSpace: 'nowrap' }}>
                      {c.status === '待處理' ? (
                        <div style={{ display: 'flex', gap: '.4rem' }}>
                          <button
                            disabled={updating === c.id}
                            onClick={() => updateStatus(c.id, '已聯繫')}
                            style={{ padding: '3px 10px', background: '#3b82f6', color: '#fff', border: 'none', fontSize: '.75rem', cursor: 'pointer', fontWeight: 600 }}
                          >聯繫</button>
                          <button
                            disabled={updating === c.id}
                            onClick={() => updateStatus(c.id, '已確認')}
                            style={{ padding: '3px 10px', background: '#10b981', color: '#fff', border: 'none', fontSize: '.75rem', cursor: 'pointer', fontWeight: 600 }}
                          >確認</button>
                          <button
                            disabled={updating === c.id}
                            onClick={() => updateStatus(c.id, '已婉拒')}
                            style={{ padding: '3px 10px', background: '#ef4444', color: '#fff', border: 'none', fontSize: '.75rem', cursor: 'pointer', fontWeight: 600 }}
                          >婉拒</button>
                        </div>
                      ) : (
                        <select
                          value={c.status}
                          onChange={e => updateStatus(c.id, e.target.value)}
                          style={{ fontSize: '.78rem', padding: '2px 6px', border: '1px solid #ddd' }}
                        >
                          <option>已聯繫</option>
                          <option>已確認</option>
                          <option>已婉拒</option>
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '.65rem .9rem', fontSize: '.73rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleString('zh-TW', {
                        timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
