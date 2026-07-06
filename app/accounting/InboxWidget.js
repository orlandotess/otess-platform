'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function InboxWidget({ notifications: initial }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const unread = items.filter(n => !n.read).length;

  async function markRead(id) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('inbox_notifications').update({ read: true }).eq('id', id);
  }

  async function markAllRead() {
    const ids = items.filter(n => !n.read).map(n => n.id);
    if (ids.length === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('inbox_notifications').update({ read: true }).in('id', ids);
  }

  if (items.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Bandeja de entrada</span>
          {unread > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--amber)', borderRadius: 10, padding: '1px 7px' }}>{unread}</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {unread > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={markAllRead}>Marcar todo leído</button>
            </div>
          )}
          <div style={{ display: 'grid' }}>
            {items.map(n => (
              <div key={n.id} onClick={() => !n.read && markRead(n.id)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: n.read ? 'default' : 'pointer' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', marginTop: 5, flexShrink: 0 }} />}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: n.read ? 'var(--muted)' : 'var(--navy)' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{n.body}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(n.created_at).toLocaleDateString('es-PR', { month: 'short', day: 'numeric' })}
                  </span>
                  {n.link && <Link href={n.link} onClick={e => e.stopPropagation()} style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 600 }}>Ver →</Link>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
