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
          <table className="table-ivu">
            <thead>
              <tr>
                <th>{t('columns.number')}</th>
                {!hideClientColumn && <th>{t('columns.client')}</th>}
                <th>{invoices.some(i => i.paid_at) ? t('columns.datePaid') : t('columns.date')}</th>
                <th className="num">{t('columns.labor')}</th>
                <th className="num">{t('columns.laborRate')}</th>
                <th className="num">{t('columns.ivuLabor')}</th>
                <th className="num">{t('columns.product')}</th>
                <th className="num">{t('columns.ivuProd')}</th>
                <th className="num">{t('columns.estatal')}</th>
                <th className="num">{t('columns.municipal')}</th>
                <th className="num">{t('columns.totalIVU')}</th>
                <th className="num">{t('columns.totalInvoice')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const b = computeInvoiceIVU(inv);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      <Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)' }}>{inv.invoice_number}</Link>
                    </td>
                    {!hideClientColumn && (
                      <td style={{ fontWeight: 600, minWidth: 116 }}>
                        {inv.clients?.name ?? '—'}
                        <div style={{ marginTop: 3 }}>
                          <span className={`badge ${b.isB2B ? 'badge-blue' : 'badge-gray'}`}>{b.isB2B ? t('clientType.b2b') : t('clientType.final')}</span>
                        </div>
                      </td>
                    )}
                    <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {inv.paid_at ?? inv.issued_at}
                      {inv.paid_at && inv.paid_at !== inv.issued_at && (
                        <div style={{ fontSize: 11, opacity: 0.7 }}>{t('invoiceDatePrefix', { date: inv.issued_at })}</div>
                      )}
                    </td>
                    <td className="num">{fmt(b.laborSub)}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{pct(b.laborRate)}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(b.laborTax)}</td>
                    <td className="num">{fmt(b.prodSub)}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(b.prodTax)}</td>
                    <td className="num">{fmt(b.estatal)}</td>
                    <td className="num">{fmt(b.municipal)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(b.totalIVU)}</td>
                    <td className="num" style={{ fontWeight: 900, color: 'var(--navy)' }}>{fmt(b.totalFactura)}</td>
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
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.laborSub)}</td>
                    <td></td>
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.laborTax)}</td>
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.prodSub)}</td>
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.prodTax)}</td>
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.estatal)}</td>
                    <td className="num" style={{ fontWeight: 700, paddingTop: 12 }}>{fmt(totals.municipal)}</td>
                    <td className="num" style={{ fontWeight: 900, fontSize: 14, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.totalIVU)}</td>
                    <td className="num" style={{ fontWeight: 900, fontSize: 14, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.totalFactura)}</td>
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
