'use client';
import { calcularIVU } from '../lib/tax';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = rate => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;

// Un solo componente, dos usos:
// - scope="bucket": dentro de la sección Fees, muestra Labor/Producto/Reembolso
//   con sus subtotales (composición del bucket, sin total destacado).
// - scope="documento": en el pie de trabajo/factura/estimado — "Labor · $X @ 4%"
//   → $Y por categoría con base > 0, más el total de IVU. Si solo una categoría
//   tiene base > 0 (documentos de solo Labor o solo Productos, como hoy) colapsa
//   a una sola línea "IVU (Y%)" en vez de enumerar las 3.
export default function TaxBreakdown({ lineas, clientType, taxRules, scope = 'documento', title, note }) {
  const resultado = calcularIVU(lineas, clientType, taxRules);
  const { categorias, subtotal, ivu, total } = resultado;
  const activas = categorias.filter(c => c.base > 0);

  if (scope === 'bucket') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {title && <p style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{title}</p>}
        {categorias.map(c => (
          <div key={c.codigo} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>{c.nombre}</span>
            <span>{fmt(c.base)}</span>
          </div>
        ))}
      </div>
    );
  }

  const collapsed = activas.length <= 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {title && <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 0 }}>{title}</p>}
      {note}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        {collapsed ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>
                Subtotal{activas[0] ? ` (${activas[0].nombre})` : ''}
              </span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>
                IVU {activas[0] ? `(${fmtPct(activas[0].tasa)})` : ''}
              </span>
              <span>{fmt(ivu)}</span>
            </div>
          </>
        ) : (
          activas.map(c => (
            <div key={c.codigo} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>{c.nombre} · {fmt(c.base)} @ {fmtPct(c.tasa)}</span>
              <span>{fmt(c.impuesto)}</span>
            </div>
          ))
        )}
        <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
          <span>Total</span><span style={{ color: 'var(--navy)' }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
