'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

const norm = v => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const addressOf = p => [p.street, p.city].filter(Boolean).join(', ');

// Buscador de propiedades del cliente — mismo patrón que ClientCombobox.
export default function PropertyCombobox({ properties, value, onChange }) {
  const t = useTranslations('facturas.propertyCombobox');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = properties.find(p => p.id === value);
  const q = norm(query.trim());
  const results = q
    ? properties.filter(p => norm([p.name, p.street, p.city].filter(Boolean).join(' ')).includes(q))
    : properties;

  function select(property) {
    onChange(property.id);
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
            value={`${selected.name}${addressOf(selected) ? ` — ${addressOf(selected)}` : ''}`}
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
            placeholder={t('placeholder')}
            style={{ padding: '8px 12px 8px 32px', width: '100%' }}
          />
        </div>
      )}

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 280, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>{t('noResults')}</p>
            ) : results.map(p => (
              <div key={p.id} className="dropdown-item" onClick={() => select(p)}
                style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: p.id === value ? 'var(--info-tint)' : undefined }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                {addressOf(p) && <div style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-word' }}>{addressOf(p)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
