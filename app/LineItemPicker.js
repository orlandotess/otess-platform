'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

// Buscador único del catálogo, resuelto por id (no por round-trip de string
// como CatalogDescriptionInput en app/LineItemRow.js). Al seleccionar copia
// descripcion/precio/tipo/tax_category/recurrencia de una sola vez via
// onSelect(catalogItem) — el llamador decide cómo mapear esos campos a su
// propio shape de línea (cada una de las 7 tablas de line items tiene
// nombres de columna ligeramente distintos).
//
// tipos filtra qué `type` de catalog_items se puede elegir aquí — por
// defecto los 3 (labor/product/fee). internal_only se filtra siempre,
// igual que CatalogDescriptionInput (nunca se debe poder facturar
// material de tracking interno por accidente).
export default function LineItemPicker({ onSelect, tipos = ['labor', 'product', 'fee'], catalogOptions = [], placeholder }) {
  const t = useTranslations('shared.lineItemPicker');
  const effectivePlaceholder = placeholder ?? t('searchPlaceholder');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const pool = catalogOptions.filter(c => tipos.includes(c.type) && !c.internal_only);
  const results = (q
    ? pool.filter(c => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.item_code?.toLowerCase().includes(q))
    : pool
  ).slice(0, 8);

  function select(c) {
    onSelect(c);
    setQuery('');
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={effectivePlaceholder}
        style={{ fontSize: 13.5, width: '100%' }}
      />
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 300, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--muted)' }}>{t('noResults')}</p>
            ) : results.map(c => (
              <div key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => select(c)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <span className={`badge ${c.type === 'labor' ? 'badge-amber' : c.type === 'fee' ? 'badge-dark' : 'badge-gray'}`} style={{ marginRight: 6 }}>
                    {c.type === 'labor' ? t('type.labor') : c.type === 'fee' ? t('type.fee') : t('type.product')}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.name || c.item_code}</span>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name && c.name !== c.item_code && `${c.item_code} — `}{c.description}</div>
                </div>
                {c.price != null && <div style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>${Number(c.price).toFixed(2)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
