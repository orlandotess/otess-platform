'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { useTranslations } from 'next-intl';

// Las filas llegan con el estado y las vistas ya traducidos desde page.js
// (allí se calcula "hoy" en hora de PR), así que aquí solo se filtra.
export default function EstimadosTableClient({ estimates }) {
  const t = useTranslations('estimados.list');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visible = query
    ? estimates.filter(e =>
        (e.estimate_number ?? '').toLowerCase().includes(query) ||
        (e.title ?? '').toLowerCase().includes(query) ||
        (e.clientName ?? '').toLowerCase().includes(query) ||
        (e.statusLabel ?? '').toLowerCase().includes(query))
    : estimates;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>{t('noResults', { search })}</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('columns.number')}</th>
                <th>{t('columns.client')}</th>
                <th>{t('columns.status')}</th>
                <th>{t('columns.date')}</th>
                <th>{t('columns.validUntil')}</th>
                <th>{t('columns.total')}</th>
                <th>{t('columns.views')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(est => (
                <tr key={est.id}>
                  <td>
                    <Link href={`/estimados/${est.id}`} style={{ color: 'inherit' }}>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{est.estimate_number}</div>
                      {est.title && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'inherit', fontWeight: 400 }}>{est.title}</div>}
                    </Link>
                  </td>
                  <td>{est.clientName ?? '—'}</td>
                  <td><span className={`badge ${est.statusCls}`}>{est.statusLabel}</span></td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{est.issued_at ?? '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{est.valid_until ?? '—'}</td>
                  <td style={{ fontWeight: 700 }}>${Number(est.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td>
                    {est.viewCount ? (
                      <span
                        title={est.viewTitle}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--navy)', fontWeight: 600, background: 'var(--navy-tint)', padding: '3px 8px', borderRadius: 12 }}
                      >
                        👁️ {est.viewCount} · {est.viewLabel}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
