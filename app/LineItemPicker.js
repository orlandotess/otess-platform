'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { matchesCatalogQuery, CATALOG_RESULT_LIMIT } from '../lib/catalogSearch';
import CatalogResults, { useCatalogNav } from './CatalogResults';

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
  const anchorRef = useRef(null);

  const pool = catalogOptions.filter(c => tipos.includes(c.type) && !c.internal_only);
  const matches = pool.filter(c => matchesCatalogQuery(c, query));
  const results = matches.slice(0, CATALOG_RESULT_LIMIT);
  const entries = results.map(item => ({ kind: 'catalog', item }));
  const { activeIndex, setActiveIndex, onKeyDown } = useCatalogNav(entries.length);

  function pick(i) {
    const entry = entries[i];
    if (!entry) return;
    onSelect(entry.item);
    setQuery('');
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }} ref={anchorRef}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => onKeyDown(e, { onPick: pick, onClose: () => setOpen(false), onOpen: () => setOpen(true) })}
        placeholder={effectivePlaceholder}
        style={{ fontSize: 13.5, width: '100%' }}
      />
      {open && (
        <CatalogResults
          anchorRef={anchorRef}
          entries={entries}
          query={query}
          activeIndex={activeIndex}
          onHover={setActiveIndex}
          onPick={pick}
          onClose={() => setOpen(false)}
          emptyLabel={t('noResults')}
          footer={matches.length > results.length && (
            <p style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>
              {t('moreResults', { shown: results.length, total: matches.length })}
            </p>
          )}
        />
      )}
    </div>
  );
}
