'use client';
import { useTranslations } from 'next-intl';

// Renderer genérico Tile/List para el catálogo — recibe los items ya
// filtrados, columnas para la vista List (código, descripción, costo,
// precio, recurrencia, tasa %...) y un render de tarjeta para la vista
// Tile. No posee estado propio (edición, fotos, etc.) — el llamador le
// pasa la fila/tarjeta ya armada, así que se puede usar con cualquier tab
// del catálogo sin que CatalogoView necesite conocer los detalles de cada
// tipo de ítem.
export default function CatalogoView({ items, view, columns = [], renderTile, emptyLabel }) {
  const t = useTranslations('shared.catalogoView');
  const empty = emptyLabel ?? t('emptyDefault');
  if (items.length === 0) {
    return <div className="empty"><p>{empty}</p></div>;
  }

  if (view === 'tile') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {items.map(renderTile)}
      </div>
    );
  }

  return (
    <div className="table-wrap" style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <table>
        <thead>
          <tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              {columns.map(col => <td key={col.key}>{col.render(item)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
