'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function catalogItemLabel(item) {
  if (!item) return '';
  // Some catalog_items rows still have a null name (see
  // migrations/2026-08-17-catalog-item-name-backfill.sql).
  return item.name || item.item_code || '';
}

/**
 * CatalogItemPicker — compact product search used in two places on the plan:
 * the toolbar chip while placing elements (so a whole run of jacks carries the
 * same product) and the marker panel (to set or change one equipment's
 * product). Suggestions are the products most used with this element type on
 * previous plans, which is what the tech reaches for nearly every time.
 */
export default function CatalogItemPicker({ products, suggestions = [], onPick, onCancel, autoFocus = true }) {
  const t = useTranslations('planos.editor.catalogPicker');
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const matches = query
    ? products.filter(p =>
        catalogItemLabel(p).toLowerCase().includes(query) || (p.item_code || '').toLowerCase().includes(query)
      ).slice(0, 6)
    : [];

  const rowStyle = {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    color: 'var(--text)', cursor: 'pointer', fontSize: 12, padding: '4px 2px',
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
      <input
        autoFocus={autoFocus}
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && onCancel) onCancel(); }}
        placeholder={t('searchPlaceholder')}
        style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
      />
      {!query && suggestions.length > 0 && (
        <>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', margin: '6px 0 2px' }}>{t('mostUsed')}</p>
          {suggestions.map(p => (
            <button key={p.id} type="button" onClick={() => onPick(p)} style={rowStyle}>
              <span style={{ color: 'var(--muted)' }}>{p.item_code}</span> {catalogItemLabel(p)}
            </button>
          ))}
        </>
      )}
      {query && matches.map(p => (
        <button key={p.id} type="button" onClick={() => onPick(p)} style={rowStyle}>
          <span style={{ color: 'var(--muted)' }}>{p.item_code}</span> {catalogItemLabel(p)}
        </button>
      ))}
      {query && matches.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 2px' }}>{t('noMatches')}</p>
      )}
    </div>
  );
}
