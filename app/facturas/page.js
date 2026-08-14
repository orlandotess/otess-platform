export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { formatDatePR, formatTimePR } from '../../lib/datetimeLocal';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';

const statusBadge = {
  draft:     { cls: 'badge-gray',  key: 'draft' },
  sent:      { cls: 'badge-blue',  key: 'sent' },
  paid:      { cls: 'badge-green', key: 'paid' },
  cancelled: { cls: 'badge-red',   key: 'cancelled' },
};

function statusFor(inv, today, t) {
  if (inv.status === 'sent' && inv.due_at && inv.due_at < today) {
    return { cls: 'badge-red', label: t('status.overdue'), overdue: true };
  }
  const badge = statusBadge[inv.status] ?? statusBadge.draft;
  return { cls: badge.cls, label: t(`status.${badge.key}`), overdue: false };
}

function formatViewedAt(dateStr, locale, t) {
  const isToday = formatDatePR(dateStr, {}, 'en-CA') === formatDatePR(new Date(), {}, 'en-CA');
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  if (isToday) {
    return t('today', { time: formatTimePR(dateStr, { hour: '2-digit', minute: '2-digit' }, dateLocale) });
  }
  return formatDatePR(dateStr, { month: 'short', day: 'numeric' }, dateLocale);
}

export default async function FacturasPage() {
  const t = await getTranslations('facturas.list');
  const locale = await getLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: invoices }, { data: views }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, issued_at, due_at, reminders_paused_at, clients(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoice_views')
      .select('invoice_id, viewed_at'),
  ]);

  // Agrupar vistas por factura: conteo + última fecha
  const viewsByInvoice = {};
  (views ?? []).forEach(v => {
    if (!viewsByInvoice[v.invoice_id]) {
      viewsByInvoice[v.invoice_id] = { count: 0, lastViewedAt: null };
    }
    viewsByInvoice[v.invoice_id].count += 1;
    if (!viewsByInvoice[v.invoice_id].lastViewedAt || new Date(v.viewed_at) > new Date(viewsByInvoice[v.invoice_id].lastViewedAt)) {
      viewsByInvoice[v.invoice_id].lastViewedAt = v.viewed_at;
    }
  });

  const totalPending = invoices?.filter(i => i.status === 'sent').reduce((a, i) => a + i.total, 0) ?? 0;
  const totalPaid = invoices?.filter(i => i.status === 'paid').reduce((a, i) => a + i.total, 0) ?? 0;

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/facturas/recurrentes" className="btn btn-ghost">{t('recurring')}</Link>
            <Link href="/facturas/nueva" className="btn btn-primary">{t('newInvoice')}</Link>
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.total')}</div>
            <div className="stat-value">{invoices?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.pending')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>${totalPending.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.collected')}</div>
            <div className="stat-value" style={{ color: 'var(--ok)', fontSize: 22 }}>${totalPaid.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>

        <div className="card">
          {!invoices?.length ? (
            <div className="empty">
              <div className="empty-glyph">🧾</div>
              <h3>{t('empty.title')}</h3>
              <p>{t('empty.text')}</p>
              <Link href="/facturas/nueva" className="btn btn-primary btn-sm">{t('empty.cta')}</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('columns.number')}</th>
                    <th>{t('columns.client')}</th>
                    <th>{t('columns.status')}</th>
                    <th>{t('columns.date')}</th>
                    <th>{t('columns.due')}</th>
                    <th>{t('columns.total')}</th>
                    <th>{t('columns.views')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusFor(inv, today, t);
                    const viewInfo = viewsByInvoice[inv.id];
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}><Link href={`/facturas/${inv.id}`} style={{ color: 'inherit' }}>{inv.invoice_number}</Link></td>
                        <td>{inv.clients?.name ?? '—'}</td>
                        <td>
                          <span className={`badge ${b.cls}`}>{b.label}</span>
                          {b.overdue && inv.reminders_paused_at && (
                            <span className="badge badge-gray" style={{ marginLeft: 4 }} title={t('remindersPaused')}>⏸</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.due_at ?? '—'}</td>
                        <td style={{ fontWeight: 700 }}>${Number(inv.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td>
                          {viewInfo ? (
                            <span
                              title={t('lastViewed', { date: formatViewedAt(viewInfo.lastViewedAt, locale, t) })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--navy)', fontWeight: 600, background: 'var(--navy-tint)', padding: '3px 8px', borderRadius: 12 }}
                            >
                              👁️ {viewInfo.count} · {formatViewedAt(viewInfo.lastViewedAt, locale, t)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
