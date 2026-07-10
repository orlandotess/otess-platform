'use client';
import { useState } from 'react';

export default function ClientCombobox({ clients, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = clients.find(c => c.id === value);
  const q = query.trim().toLowerCase();
  const results = q
    ? clients.filter(c => c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)).slice(0, 20)
    : clients.slice(0, 20);

  function select(client) {
    onChange(client.id);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
  }

  return (
    <div style={{ position: 'relative' }}>
      {selected && !open ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            readOnly
            value={`${selected.name}${selected.company ? ` — ${selected.company}` : ''}${selected.client_type === 'b2b' ? ' (B2B)' : ''}`}
            onClick={() => setOpen(true)}
            style={{ flex: 1, cursor: 'pointer' }}
          />
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={clear}>✕</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nombre o empresa..."
            style={{ padding: '8px 12px 8px 32px', width: '100%' }}
          />
        </div>
      )}

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 280, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>Sin resultados.</p>
            ) : results.map(c => (
              <div key={c.id} onClick={() => select(c)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                  {c.company && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.company}</div>}
                </div>
                {c.client_type === 'b2b' && <span className="badge badge-blue" style={{ fontSize: 10, alignSelf: 'center' }}>B2B</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
