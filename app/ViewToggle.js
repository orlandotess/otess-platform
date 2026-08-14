'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'otess_catalogo_view';

// Pill gris con icono de grid + chevron, dropdown de dos opciones (Tile/List)
// con checkmark en la activa. Persiste en localStorage bajo otess_catalogo_view
// para que la preferencia se mantenga entre sesiones y entre tabs del catálogo.
export function useCatalogView(defaultView = 'list') {
  const [view, setView] = useState(defaultView);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === 'tile' || saved === 'list') setView(saved);
  }, []);
  function change(next) {
    setView(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  }
  return [view, change];
}

export default function ViewToggle({ view, onChange }) {
  const t = useTranslations('shared.viewToggle');
  const [open, setOpen] = useState(false);
  const label = view === 'tile' ? t('tileView') : t('listView');

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden>▦</span> {label} <span aria-hidden style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 150, overflow: 'hidden' }}>
            {[['tile', t('tileView')], ['list', t('listView')]].map(([value, text]) => (
              <button key={value} type="button" onClick={() => { onChange(value); setOpen(false); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--navy)' }}>
                {text} {view === value && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
