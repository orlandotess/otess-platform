'use client';
import { useTranslations } from 'next-intl';
import { buildMaterialSummary, exportMaterialSummaryCSV } from '../lib/materialSummary';

// Internal takeoff pivot: one row per material across the whole document, with
// the per-area quantities beside it. Deliberately rendered outside the
// `estimate-doc` element the client PDF is captured from, and marked no-print —
// it exposes bundled quantities and costs the client-facing document folds into
// a single lot price.
export default function MaterialSummary({ items = [], docNumber }) {
  const t = useTranslations('shared.materialSummary');
  const generalArea = t('generalArea');
  const { rows, areas, totalQuantity, grandTotal, unpricedCount } = buildMaterialSummary(items, generalArea);
  if (rows.length === 0) return null;

  const multiArea = areas.length > 1;
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const th = extra => ({ color: '#fff', padding: '10px 14px', fontSize: 11, ...extra });
  const td = extra => ({ padding: '10px 14px', fontSize: 13, ...extra });

  return (
    <div className="card no-print" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>🧮 {t('title')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t('subtitle')}</div>
        </div>
        <button className="btn btn-ghost" onClick={() => exportMaterialSummaryCSV(items, docNumber, t, generalArea)}>
          ⬇️ {t('exportBtn')}
        </button>
      </div>

      {unpricedCount > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-2)', borderLeft: '3px solid var(--warn)', fontSize: 12.5, color: 'var(--navy)' }}>
          <strong>{t('unpricedWarning', { count: unpricedCount })}</strong> {t('unpricedHint')}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr style={{ background: 'var(--navy)' }}>
              <th style={th({ textAlign: 'left' })}>{t('columnMaterial')}</th>
              {multiArea && areas.map(a => <th key={a} style={th({ textAlign: 'right' })}>{a}</th>)}
              <th style={th({ textAlign: 'right' })}>{t('columnQuantity')}</th>
              <th style={th({ textAlign: 'right' })}>{t('columnUnitPrice')}</th>
              <th style={th({ textAlign: 'right' })}>{t('columnTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.description} style={r.unpriced ? { background: 'var(--surface-2)' } : undefined}>
                <td style={td({ fontWeight: 500 })}>
                  {r.description}
                  {r.vendor && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{r.vendor}</div>}
                </td>
                {multiArea && areas.map(a => (
                  <td key={a} style={td({ textAlign: 'right', color: r.byArea[a] ? 'var(--navy)' : 'var(--muted)' })}>
                    {r.byArea[a] ?? '—'}
                  </td>
                ))}
                <td style={td({ textAlign: 'right', fontWeight: 700 })}>{r.quantity}</td>
                <td style={td({ textAlign: 'right', color: r.unpriced ? 'var(--warn)' : 'var(--muted)' })}>
                  {r.unitPrice == null ? t('mixedPrice') : fmt(r.unitPrice)}
                </td>
                <td style={td({ textAlign: 'right', fontWeight: 700, color: r.unpriced ? 'var(--warn)' : 'var(--navy)' })}>{fmt(r.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td style={td({ fontWeight: 800, color: 'var(--navy)' })}>{t('grandTotalLabel')}</td>
              {multiArea && areas.map(a => <td key={a} />)}
              <td style={td({ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' })}>{totalQuantity}</td>
              <td />
              <td style={td({ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' })}>{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.some(r => r.unitPrice == null) && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>{t('mixedPriceNote')}</div>
      )}
    </div>
  );
}
