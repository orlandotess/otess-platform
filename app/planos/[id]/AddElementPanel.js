'use client';
import { useMemo, useState } from 'react';
import { ElementIcon } from '../../equipmentIcons';

const CUSTOM_SECTION = '__custom__';

/**
 * AddElementPanel — categorized "Add Element" picker (SystemSurveyor-style)
 * for the Planos toolbar: search box + accordion of system categories, each
 * expanding to a 3-column icon grid, plus a pinned "Mis íconos" section for
 * the org's uploaded custom icons. Picking an element or custom icon arms
 * placement mode in the parent and closes the panel.
 */
export default function AddElementPanel({ elementTypes, customIcons, onSelectElement, onSelectCustomIcon }) {
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState(() => new Set());

  const categories = useMemo(() => {
    const map = new Map();
    for (const el of elementTypes) {
      if (!map.has(el.system_name)) map.set(el.system_name, { name: el.system_name, color: el.system_color, elements: [] });
      map.get(el.system_name).elements.push(el);
    }
    return [...map.values()];
  }, [elementTypes]);

  const query = search.trim().toLowerCase();
  const filtering = query.length > 0;
  const elementMatches = el => el.name.toLowerCase().includes(query) || el.abbr.toLowerCase().includes(query);

  function toggleCategory(name) {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function categoryHeader(key, color, label, count, open) {
    return (
      <button
        type="button"
        onClick={() => toggleCategory(key)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', borderRadius: 6,
          fontSize: 13, fontWeight: 700,
        }}
      >
        {color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />}
        {label}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{count}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>{open ? '▼' : '▶'}</span>
      </button>
    );
  }

  const customMatches = customIcons.filter(ic => !filtering || ic.name.toLowerCase().includes(query));

  return (
    <div className="card" style={{ padding: 12 }}>
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Buscar elemento..."
        style={{ width: '100%', marginBottom: 10, fontSize: 13 }}
      />
      <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {categories.map(cat => {
          const matches = filtering ? cat.elements.filter(elementMatches) : cat.elements;
          if (filtering && matches.length === 0) return null;
          const open = filtering || openCategories.has(cat.name);
          return (
            <div key={cat.name}>
              {categoryHeader(cat.name, cat.color, cat.name, matches.length, open)}
              {open && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '4px 4px 8px' }}>
                  {matches.map(el => (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => onSelectElement(el.id)}
                      title={el.is_path_tool ? `${el.name} — traza una línea entre dos equipos` : el.name}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '8px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
                        cursor: 'pointer', fontSize: 10.5, textAlign: 'center', lineHeight: 1.2,
                      }}
                    >
                      {el.is_path_tool ? <span style={{ fontSize: 20, lineHeight: 1 }}>🔗</span> : <ElementIcon element={el} size={20} />}
                      <span>{el.name}{el.is_path_tool ? ' 🔗' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {customIcons.length > 0 && (!filtering || customMatches.length > 0) && (
          <div>
            {categoryHeader(CUSTOM_SECTION, null, '🖼️ Mis íconos', customMatches.length, filtering || openCategories.has(CUSTOM_SECTION))}
            {(filtering || openCategories.has(CUSTOM_SECTION)) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '4px 4px 8px' }}>
                {customMatches.map(ic => (
                  <button
                    key={ic.id}
                    type="button"
                    onClick={() => onSelectCustomIcon(ic.id)}
                    title={ic.name}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
                      cursor: 'pointer', fontSize: 10.5, textAlign: 'center', lineHeight: 1.2,
                    }}
                  >
                    {ic.url && <img src={ic.url} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                    <span>{ic.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {categories.length === 0 && customIcons.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>No hay elementos en el catálogo.</p>
        )}
      </div>
    </div>
  );
}
