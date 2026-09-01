'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

// Panel de resultados compartido por los dos buscadores del catálogo:
// CatalogDescriptionInput (app/LineItemRow.js), que vive dentro de una columna
// angosta de la fila, y LineItemPicker (app/LineItemPicker.js), que ocupa el
// ancho de la tarjeta. Antes cada uno pintaba su propia lista y la de la fila
// heredaba el ancho del input (~150px), así que cada resultado se partía en
// cuatro líneas y la descripción se cortaba antes de decir nada útil.
//
// Aquí el panel tiene ancho propio (mínimo PANEL_MIN, se voltea a la derecha
// si no cabe), cada resultado ocupa dos líneas fijas — badge + nombre, luego
// código y descripción — y las palabras buscadas van resaltadas.

const PANEL_MIN = 400;
const BADGE_CLASS = { labor: 'badge-amber', fee: 'badge-dark', product: 'badge-gray' };

function escapeRx(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resalta cada palabra de la consulta por separado: matchesCatalogQuery busca
// palabras sueltas en cualquier orden, así que "keypad touch" tiene que
// marcar las dos aunque no estén seguidas en el nombre.
function markMatches(text, query) {
  const s = String(text ?? '');
  const words = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!s || words.length === 0) return s;
  const rx = new RegExp(`(${words.slice().sort((a, b) => b.length - a.length).map(escapeRx).join('|')})`, 'ig');
  return s.split(rx).map((part, i) => (
    words.includes(part.toLowerCase())
      ? <mark key={i} style={{ background: 'var(--amber-tint)', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{part}</mark>
      : part
  ));
}

// ↑/↓ mueven el resaltado, Enter escoge la fila activa, Esc cierra. El índice
// se guarda aquí para que ambos buscadores se manejen igual con el teclado.
export function useCatalogNav(count) {
  const [activeIndex, setActiveIndex] = useState(-1);
  // Si la lista se acorta al seguir escribiendo, la fila resaltada ya no existe.
  useEffect(() => { setActiveIndex(i => (i >= count ? -1 : i)); }, [count]);

  function onKeyDown(e, { onPick, onClose, onOpen }) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      onOpen?.();
      if (count === 0) return;
      setActiveIndex(i => (e.key === 'ArrowDown'
        ? (i < 0 ? 0 : (i + 1) % count)
        : (i <= 0 ? count - 1 : i - 1)));
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < count) {
      e.preventDefault();
      onPick(activeIndex);
      setActiveIndex(-1);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setActiveIndex(-1);
      onClose();
    }
  }

  return { activeIndex, setActiveIndex, onKeyDown };
}

// entries: [{ kind: 'suggestion', label } | { kind: 'catalog', item }]
export default function CatalogResults({
  anchorRef, entries, query, activeIndex, onHover, onPick, onClose, emptyLabel, footer,
}) {
  const t = useTranslations('shared.catalogResults');
  const rowRefs = useRef([]);
  const [flip, setFlip] = useState(false);

  // Si el input está pegado al borde derecho, el panel se ancla por la derecha
  // en vez de desbordarse fuera de la pantalla.
  useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFlip(r.left + Math.max(PANEL_MIN, r.width) > window.innerWidth - 8);
  }, [anchorRef, entries.length]);

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={onClose} />
      <div style={{
        position: 'absolute', top: '100%', marginTop: 4,
        ...(flip ? { right: 0 } : { left: 0 }),
        width: `max(100%, ${PANEL_MIN}px)`, maxWidth: 'calc(100vw - 24px)',
        background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8,
        boxShadow: 'var(--shadow-pop)', zIndex: 20, maxHeight: 320, overflowY: 'auto', overflowX: 'hidden',
      }}>
        {entries.length === 0 ? (
          <p style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>{emptyLabel}</p>
        ) : entries.map((entry, i) => {
          const active = i === activeIndex;
          const rowStyle = {
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 10,
            padding: '7px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
            background: active ? 'var(--surface-2)' : 'transparent',
            boxShadow: active ? 'inset 3px 0 0 var(--amber)' : 'none',
          };
          const common = {
            onMouseDown: e => e.preventDefault(),
            onMouseEnter: () => onHover(i),
            onClick: () => onPick(i),
            ref: el => { rowRefs.current[i] = el; },
            style: rowStyle,
          };
          if (entry.kind === 'suggestion') {
            return (
              <div key={`sug-${entry.label}`} {...common}>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {markMatches(entry.label, query)}
                </span>
              </div>
            );
          }
          const c = entry.item;
          const name = c.name || c.item_code;
          const sub = [c.name && c.name !== c.item_code ? c.item_code : null, c.description].filter(Boolean).join(' — ');
          return (
            <div key={c.id} {...common}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span className={`badge ${BADGE_CLASS[c.type] ?? 'badge-gray'}`} style={{ flexShrink: 0 }}>
                    {t(`type.${c.type === 'labor' ? 'labor' : c.type === 'fee' ? 'fee' : 'product'}`)}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {markMatches(name, query)}
                  </span>
                </div>
                {sub && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {markMatches(sub, query)}
                  </div>
                )}
              </div>
              {c.price != null && (
                <div style={{ fontSize: 12.5, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  ${Number(c.price).toFixed(2)}
                </div>
              )}
            </div>
          );
        })}
        {footer}
      </div>
    </>
  );
}
