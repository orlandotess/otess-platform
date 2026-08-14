'use client';
import { calcularIVU, aplicarDescuento } from '../lib/tax';
import { useTranslations } from 'next-intl';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = rate => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;

// Un solo componente, dos usos:
// - scope="bucket": dentro de la sección Fees, muestra Labor/Producto/Reembolso
//   con sus subtotales (composición del bucket, sin total destacado).
// - scope="documento": en el pie de trabajo/factura/estimado — "Subtotal Labor"
//   / "IVU Labor (4%)" por categoría. Labor y Producto siempre se listan por
//   separado, aunque alguna tenga base $0 (mismo criterio que ya usan las
//   vistas de solo-lectura de factura/estima — nunca se combinan en una sola
//   línea). Reembolso solo aparece cuando tiene base > 0, por ser poco frecuente.
export default function TaxBreakdown({ lineas, clientType, taxRules, scope = 'documento', title, note, discountType, discountValue, discountNote }) {
  const t = useTranslations('shared.taxBreakdown');
  const resultado = calcularIVU(lineas, clientType, taxRules);
  const { categorias, total: preDiscountTotal } = resultado;
  const { discountAmount, finalTotal } = aplicarDescuento(preDiscountTotal, discountType, discountValue);
  const total = finalTotal;

  // c.nombre viene de lib/tax.js (CATEGORY_LABELS), que siempre está en
  // español — usamos c.codigo (estable, no traducido) para resolver la
  // etiqueta visible en el idioma activo en vez de mostrar c.nombre directo.
  const categoryLabel = c => t(`categories.${c.codigo}`);

  if (scope === 'bucket') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {title && <p style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{title}</p>}
        {categorias.map(c => (
          <div key={c.codigo} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>{categoryLabel(c)}</span>
            <span>{fmt(c.base)}</span>
          </div>
        ))}
      </div>
    );
  }

  const visibles = categorias.filter(c => c.codigo !== 'reembolso' || c.base > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {title && <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 0 }}>{title}</p>}
      {note}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        {visibles.map(c => (
          <div key={c.codigo} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>{t('subtotalCategory', { category: categoryLabel(c) })}</span>
              <span>{fmt(c.base)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>{t('taxCategory', { category: categoryLabel(c), rate: fmtPct(c.tasa) })}</span>
              <span>{fmt(c.impuesto)}</span>
            </div>
          </div>
        ))}
        {discountAmount > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>
                {discountType === 'percent' ? t('discountPercent', { percent: Number(discountValue) }) : t('discount')}
              </span>
              <span style={{ color: 'var(--danger, #c0392b)' }}>-{fmt(discountAmount)}</span>
            </div>
            {discountNote && (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{discountNote}</span>
            )}
          </div>
        )}
        <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
          <span>{t('total')}</span><span style={{ color: 'var(--navy)' }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
