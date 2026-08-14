'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import { computeInvoiceIVU } from '../../../lib/ivu';
import { useTranslations } from 'next-intl';

export default function IVUInvoiceTableClient({ invoices, periodLabel, hideClientColumn = false }) {
  const t = useTranslations('accounting.ivuInvoiceTable');
  const [search, setSearch] = useState('');
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = n => n === null ? '—' : `${(n * 100).toFixed(1)}%`;

  const query = search.trim().toLowerCase();
  const visible = query
    ? invoices.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || (inv.clients?.name ?? '').toLowerCase().includes(query))
    : invoices;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{t('detailTitle')}{periodLabel ? ` — ${periodLabel}` : ''}</p>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {invoices.length === 0 ? (
        <div className="empty"><p>{t('empty')}</p></div>
      ) : visible.length === 0 ? (
        <div className="empty"><p>{t('noResults', { search })}</p></div>
      ) : (
        <div className="table-wrap">
          <table style={{ minWidth: 1180, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th>{t('columns.number')}</th>
                {!hideClientColumn && <th>{t('columns.client')}</th>}
                <th>{invoices.some(i => i.paid_at) ? t('columns.datePaid') : t('columns.date')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.labor')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.laborRate')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.ivuLabor')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.product')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.ivuProd')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.estatal')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.municipal')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.totalIVU')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.totalInvoice')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const b = computeInvoiceIVU(inv);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      <Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)' }}>{inv.invoice_number}</Link>
                    </td>
                    {!hideClientColumn && (
                      <td style={{ fontWeight: 600 }}>
                        {inv.clients?.name ?? '—'}
                        <span className={`badge ${b.isB2B ? 'badge-blue' : 'badge-gray'}`} style={{ marginLeft: 6 }}>{b.isB2B ? t('clientType.b2b') : t('clientType.final')}</span>
                      </td>
                    )}
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {inv.paid_at ?? inv.issued_at}
                      {inv.paid_at && inv.paid_at !== inv.issued_at && (
                        <div style={{ fontSize: 11, opacity: 0.7 }}>{t('invoiceDatePrefix', { date: inv.issued_at })}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmt(b.laborSub)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 13 }}>{pct(b.laborRate)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(b.laborTax)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(b.prodSub)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(b.prodTax)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(b.estatal)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(b.municipal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(b.totalIVU)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--navy)' }}>{fmt(b.totalFactura)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totals = visible.reduce((acc, inv) => {
                  const b = computeInvoiceIVU(inv);
                  acc.laborSub += b.laborSub;
                  acc.laborTax += b.laborTax;
                  acc.prodSub += b.prodSub;
                  acc.prodTax += b.prodTax;
                  acc.estatal += b.estatal;
                  acc.municipal += b.municipal;
                  acc.totalIVU += b.totalIVU;
                  acc.totalFactura += b.totalFactura;
                  return acc;
                }, { laborSub: 0, laborTax: 0, prodSub: 0, prodTax: 0, estatal: 0, municipal: 0, totalIVU: 0, totalFactura: 0 });
                return (
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={hideClientColumn ? 2 : 3} style={{ fontWeight: 700, paddingTop: 12 }}>{t('total')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.laborSub)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.laborTax)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.prodSub)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.prodTax)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.estatal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.municipal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.totalIVU)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.totalFactura)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
