'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import { useTranslations } from 'next-intl';

const statusBadgeDefs = {
  draft:     { cls: 'badge-gray',  key: 'draft' },
  sent:      { cls: 'badge-blue',  key: 'sent' },
  paid:      { cls: 'badge-green', key: 'paid' },
  cancelled: { cls: 'badge-red',   key: 'cancelled' },
};

export default function FacturasTableClient({ invs, totalFacturado, collectedByInvoice = {}, retenidoByInvoice = {} }) {
  const t = useTranslations('accounting.facturasReportTable');
  const statusBadge = Object.fromEntries(
    Object.entries(statusBadgeDefs).map(([k, v]) => [k, { cls: v.cls, label: t(`status.${v.key}`) }])
  );
  const [search, setSearch] = useState('');
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv => inv.status === 'sent' && inv.due_at && inv.due_at < today;

  const query = search.trim().toLowerCase();
  const clientDisplay = inv => inv.bill_to === 'company' && inv.clients?.company ? inv.clients.company : inv.clients?.name ?? '—';
  const cobrado = inv => collectedByInvoice[inv.id] ?? 0;
  const retenido = inv => retenidoByInvoice[inv.id] ?? 0;
  // Retención (10% labor withholding, see Retenciones) is money remitted to
  // Hacienda on the client's behalf, not an unpaid balance — netted out
  // alongside cash collected before anything counts as still owed. A draft
  // hasn't been sent to the client yet (and cancelled never will be), so
  // neither is a real debt — matches the same status filter used for the
  // Pendiente/Vencido stat cards in page.js, else the two disagree.
  const pendiente = inv => (inv.status === 'draft' || inv.status === 'cancelled')
    ? 0
    : Math.max(Number(inv.total ?? 0) - cobrado(inv) - retenido(inv), 0);
  const visible = query
    ? invs.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || clientDisplay(inv).toLowerCase().includes(query))
    : invs;
  // Footer totals exclude draft/cancelled so they match the Facturado/
  // Cobrado/Retenido/Pendiente stat cards above (same basis as page.js) —
  // rows still list every invoice, including drafts, for pipeline visibility.
  const counted = visible.filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled');
  const hasExcluded = visible.length !== counted.length;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {invs.length === 0 ? (
        <div className="empty"><p>{t('empty')}</p></div>
      ) : visible.length === 0 ? (
        <div className="empty"><p>{t('noResults', { search })}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table-dense">
            <thead>
              <tr>
                <th>{t('columns.number')}</th>
                <th>{t('columns.client')}</th>
                <th>{t('columns.type')}</th>
                <th>{t('columns.status')}</th>
                <th>{t('columns.date')}</th>
                <th>{t('columns.due')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.subtotal')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.ivuProd')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.ivuLabor')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.total')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.collected')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.withholding')}</th>
                <th style={{ textAlign: 'right' }}>{t('columns.pending')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const overdue = isOverdue(inv);
                const b = overdue ? { cls: 'badge-red', label: t('status.overdue') } : (statusBadge[inv.status] ?? statusBadge.draft);
                const subtotal = Number(inv.subtotal_products ?? 0) + Number(inv.subtotal_labor ?? 0);
                const pend = pendiente(inv);
                const ret = retenido(inv);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}><Link href={`/facturas/${inv.id}`} style={{ color: 'inherit' }}>{inv.invoice_number}</Link></td>
                    <td style={{ fontWeight: 600 }}>{clientDisplay(inv)}</td>
                    <td><span className={`badge ${inv.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>{inv.clients?.client_type === 'b2b' ? t('clientType.b2b') : t('clientType.final')}</span></td>
                    <td>
                      <span className={`badge ${b.cls}`}>{b.label}</span>
                      {overdue && inv.reminders_paused_at && (
                        <span className="badge badge-gray" style={{ marginLeft: 4 }} title={t('remindersPaused')}>⏸</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                    <td style={{ color: overdue ? 'var(--warn)' : 'var(--muted)', fontSize: 13, fontWeight: overdue ? 700 : 400 }}>{inv.due_at ?? '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(subtotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_products)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_labor)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ok)' }}>{fmt(cobrado(inv))}</td>
                    <td style={{ textAlign: 'right', color: ret > 0 ? 'var(--navy)' : 'var(--muted)' }}>{fmt(ret)}</td>
                    <td style={{ textAlign: 'right', fontWeight: pend > 0 ? 700 : 400, color: pend > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmt(pend)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={6} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>{query ? t('totalsVisible') : t('totals')}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.subtotal_products ?? 0) + Number(i.subtotal_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.tax_products ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.total ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, color: 'var(--ok)' }}>{fmt(counted.reduce((a, i) => a + cobrado(i), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, color: 'var(--navy)' }}>{fmt(counted.reduce((a, i) => a + retenido(i), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, paddingTop: 12, color: 'var(--amber)' }}>{fmt(counted.reduce((a, i) => a + pendiente(i), 0))}</td>
              </tr>
            </tfoot>
          </table>
          {hasExcluded && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {t('excludedNote', { excluded: visible.length - counted.length, total: visible.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
