export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { formatDatePR, formatTimePR } from '../../lib/datetimeLocal';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import { Suspense } from 'react';
import InvoiceSearch from './InvoiceSearch';
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

// Filtros de las tarjetas de estado (?estado=...). "pendientes" = enviadas sin
// cobrar, incluidas las vencidas; "vencidas" = pendientes con fecha de
// vencimiento pasada; "pagadas" = cobradas; sin parámetro = todas.
const FILTERS = {
  pendientes: ()    => inv => inv.status === 'sent',
  vencidas:   today => inv => inv.status === 'sent' && !!inv.due_at && inv.due_at < today,
  pagadas:    ()    => inv => inv.status === 'paid',
};

// Normaliza para buscar sin importar mayúsculas ni acentos.
const norm = str => (str ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const money = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatCard({ href, active, accent, label, value, sub, valueStyle }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="stat-card"
      data-accent={accent}
      aria-current={active ? 'true' : undefined}
      style={{
        display: 'block', color: 'inherit', textDecoration: 'none', cursor: 'pointer',
        ...(active ? { borderColor: 'var(--amber)', background: 'var(--amber-tint)' } : {}),
      }}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={valueStyle}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{sub}</div>}
    </Link>
  );
}

export default async function FacturasPage(props) {
  const searchParams = await props.searchParams;
  const filter = FILTERS[searchParams?.estado] ? searchParams.estado : 'todas';
  const q = typeof searchParams?.q === 'string' ? searchParams.q.trim() : '';
  // Enlaces de las tarjetas: cambian el estado y conservan la búsqueda.
  const hrefFor = estado => {
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/facturas?${qs}` : '/facturas';
  };
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

  const all = invoices ?? [];
  const pendingInvoices = all.filter(FILTERS.pendientes(today));
  const overdueInvoices = all.filter(FILTERS.vencidas(today));
  const paidInvoices = all.filter(FILTERS.pagadas(today));
  const sum = list => list.reduce((a, i) => a + Number(i.total), 0);
  const totalPending = sum(pendingInvoices);
  const totalOverdue = sum(overdueInvoices);
  const totalPaid = sum(paidInvoices);

  const byStatus = filter === 'todas' ? all : all.filter(FILTERS[filter](today));
  // Búsqueda por cliente (o número de factura); todas las palabras deben aparecer.
  const words = norm(q).split(/\s+/).filter(Boolean);
  const visible = words.length
    ? byStatus.filter(inv => {
        const haystack = norm(`${inv.clients?.name ?? ''} ${inv.invoice_number ?? ''}`);
        return words.every(w => haystack.includes(w));
      })
    : byStatus;

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

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <StatCard
            href={hrefFor(null)}
            active={filter === 'todas'}
            label={t('stats.total')}
            value={invoices?.length ?? 0}
            sub={t('filters.viewAll')}
          />
          <StatCard
            href={hrefFor('pendientes')}
            active={filter === 'pendientes'}
            accent="amber"
            label={t('stats.pending')}
            value={money(totalPending)}
            valueStyle={{ color: 'var(--amber)', fontSize: 22 }}
            sub={t('filters.invoiceCount', { count: pendingInvoices.length })}
          />
          <StatCard
            href={hrefFor('vencidas')}
            active={filter === 'vencidas'}
            accent="warn"
            label={t('stats.overdue')}
            value={money(totalOverdue)}
            valueStyle={{ color: overdueInvoices.length ? 'var(--warn)' : 'var(--muted)', fontSize: 22 }}
            sub={t('filters.invoiceCount', { count: overdueInvoices.length })}
          />
          <StatCard
            href={hrefFor('pagadas')}
            active={filter === 'pagadas'}
            accent="ok"
            label={t('stats.collected')}
            value={money(totalPaid)}
            valueStyle={{ color: 'var(--ok)', fontSize: 22 }}
            sub={t('filters.invoiceCount', { count: paidInvoices.length })}
          />
        </div>

        {(filter !== 'todas' || q) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)' }}>
              {t(`filters.showing.${filter}`, { count: visible.length })}
              {q && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {t('filters.matching', { search: q })}</span>}
            </div>
            <Link href="/facturas" scroll={false} className="btn btn-ghost btn-sm">{t('filters.clear')}</Link>
          </div>
        )}

        <div className="card">
          {!invoices?.length ? (
            <div className="empty">
              <div className="empty-glyph">🧾</div>
              <h3>{t('empty.title')}</h3>
              <p>{t('empty.text')}</p>
              <Link href="/facturas/nueva" className="btn btn-primary btn-sm">{t('empty.cta')}</Link>
            </div>
          ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Suspense fallback={null}>
                <InvoiceSearch placeholder={t('searchPlaceholder')} />
              </Suspense>
            </div>
            {!visible.length ? (
            <div className="empty">
              <p>{q ? t('filters.noResults', { search: q }) : t(`filters.empty.${filter}`)}</p>
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
                  {visible.map(inv => {
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
          </>
          )}
        </div>
      </main>
    </div>
  );
}
