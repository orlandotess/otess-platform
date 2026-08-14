export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../lib/supabase';
import { getCurrentProfile } from '../lib/supabase-server';
import { formatDatePR, formatDateTimePR } from '../lib/datetimeLocal';
import { pickMapsLink } from '../lib/mapsLinks';
import Sidebar from './Sidebar';
import Link from 'next/link';
import DashboardCalendarWidget from './DashboardCalendarWidget';
import InboxWidget from './accounting/InboxWidget';
import { getTranslations, getLocale } from 'next-intl/server';

async function getStats() {
  const [clients, jobs, activeJobs, tickets, activeTickets, { data: invoices }, { data: payments }, { data: expenses }] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('service_tickets').select('*', { count: 'exact', head: true }),
    supabase.from('service_tickets').select('*', { count: 'exact', head: true }).eq('status', 'en_progreso'),
    supabase.from('invoices').select('id, total, status, due_at'),
    supabase.from('payments').select('invoice_id, amount'),
    supabase.from('expenses').select('amount'),
  ]);

  const collectedByInvoice = {};
  (payments ?? []).forEach(p => {
    collectedByInvoice[p.invoice_id] = (collectedByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0);
  });
  const totalCollected = (payments ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const pendingInvoices = (invoices ?? []).filter(i => i.status === 'sent');
  const pendingTotal = pendingInvoices.reduce((a, i) => {
    const collected = collectedByInvoice[i.id] ?? 0;
    return a + Math.max(Number(i.total ?? 0) - collected, 0);
  }, 0);

  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = pendingInvoices.filter(i => i.due_at && i.due_at < today);
  const overdueTotal = overdueInvoices.reduce((a, i) => {
    const collected = collectedByInvoice[i.id] ?? 0;
    return a + Math.max(Number(i.total ?? 0) - collected, 0);
  }, 0);

  return {
    clients: clients.count ?? 0,
    jobs: jobs.count ?? 0,
    activeJobs: activeJobs.count ?? 0,
    tickets: tickets.count ?? 0,
    activeTickets: activeTickets.count ?? 0,
    caja: totalCollected - totalExpenses,
    pendingTotal,
    pendingCount: pendingInvoices.length,
    overdueTotal,
    overdueCount: overdueInvoices.length,
  };
}

async function getRecentJobs() {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, property_name, street, city, state, zip, clients(name)')
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

async function getInboxNotifications() {
  const { data } = await supabase
    .from('inbox_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  return data ?? [];
}

async function getAccionRequerida() {
  const t = await getTranslations('home.dashboard.accionRequerida');
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: solicitudes }, { data: jobsSinAsignar }, { data: invoicesDraft }, { data: invoicesOverdue }, { data: gestiones }] = await Promise.all([
    supabase.from('solicitudes')
      .select('id, solicitud_number, title, requested_on, clients(name)')
      .in('status', ['nueva', 'necesita_aprobacion'])
      .order('requested_on', { ascending: true })
      .limit(8),
    supabase.from('jobs')
      .select('id, job_number, title, property_name, city, created_at, job_technicians(technician_id)')
      .is('technician_id', null)
      .not('status', 'in', '(completed,cancelled)')
      .order('created_at', { ascending: true })
      .limit(30),
    supabase.from('invoices')
      .select('id, invoice_number, total, clients(name)')
      .eq('status', 'draft')
      .limit(8),
    supabase.from('invoices')
      .select('id, invoice_number, total, due_at, clients(name)')
      .eq('status', 'sent')
      .lt('due_at', today)
      .order('due_at', { ascending: true })
      .limit(8),
    supabase.from('gestiones')
      .select('id, title, type, due_date, client_id, assigned_to_id, assigned_to_name, clients(name)')
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
  ]);

  const automaticItems = [
    ...(solicitudes ?? []).map(s => ({
      id: `solicitud-${s.id}`,
      title: t('newSolicitudUnquoted'),
      subtitle: `${s.clients?.name ?? t('clientFallback')} · ${s.solicitud_number ?? s.title}`,
      href: `/solicitudes/${s.id}`,
      ctaLabel: t('quote'),
      urgency: 'amber',
    })),
    ...(jobsSinAsignar ?? []).filter(j => (j.job_technicians ?? []).length === 0).slice(0, 8).map(j => ({
      id: `job-${j.id}`,
      title: t('unassignedJob'),
      subtitle: [j.job_number, j.title, j.property_name || j.city].filter(Boolean).join(' · '),
      href: `/trabajos/${j.id}`,
      ctaLabel: t('assign'),
      urgency: 'amber',
    })),
    ...(invoicesDraft ?? []).map(i => ({
      id: `invoice-draft-${i.id}`,
      title: t('unsentInvoice'),
      subtitle: `${i.clients?.name ?? t('clientFallback')} · ${i.invoice_number} · ${fmt(i.total)}`,
      href: `/facturas/${i.id}`,
      ctaLabel: t('send'),
      urgency: 'warn',
    })),
    ...(invoicesOverdue ?? []).map(i => ({
      id: `invoice-overdue-${i.id}`,
      title: t('overdueInvoice'),
      subtitle: `${i.clients?.name ?? t('clientFallback')} · ${i.invoice_number} · ${fmt(i.total)}`,
      href: `/facturas/${i.id}`,
      ctaLabel: t('view'),
      urgency: 'warn',
    })),
  ];

  return { automaticItems, gestiones: gestiones ?? [] };
}

async function getOfficeProfiles() {
  const { data } = await supabase
    .from('profiles')
    .select('id, name')
    .in('role', ['admin', 'secretaria', 'vendedor'])
    .order('name');
  return data ?? [];
}

async function getIntegrationStats() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const [{ data: paypalPayments }, { data: acceptedEstimates }, { data: lockedProfiles }] = await Promise.all([
    supabase.from('payments').select('amount, paid_at, invoices(invoice_number)').eq('method', 'paypal').gte('paid_at', since30).order('paid_at', { ascending: false }),
    supabase.from('estimates').select('id, estimate_number, accepted_at, clients(name)').eq('status', 'accepted').is('converted_to_job_id', null).order('accepted_at', { ascending: false }),
    supabase.from('profiles').select('id, name, email, locked_until').gt('locked_until', nowIso).order('locked_until', { ascending: false }),
  ]);

  return {
    paypalCount: paypalPayments?.length ?? 0,
    paypalTotal: (paypalPayments ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0),
    paypalRecent: (paypalPayments ?? []).slice(0, 3),
    acceptedEstimates: acceptedEstimates ?? [],
    lockedProfiles: lockedProfiles ?? [],
  };
}

const statusBadgeCls = {
  estimate:    'badge-gray',
  scheduled:   'badge-blue',
  in_progress: 'badge-amber',
  completed:   'badge-green',
  cancelled:   'badge-red',
};

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function jobLocation(j) {
  return [j.property_name, j.city].filter(Boolean).join(' — ');
}

export default async function Home() {
  const [stats, recentJobs, inboxNotifications, accionRequerida, officeProfiles, currentProfile, integrations] = await Promise.all([
    getStats(), getRecentJobs(), getInboxNotifications(), getAccionRequerida(), getOfficeProfiles(), getCurrentProfile(), getIntegrationStats(),
  ]);
  const t = await getTranslations('home.dashboard');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{t('title')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              {t('welcome')}
            </p>
          </div>
          <Link href="/crew" className="btn btn-orange">📱 {t('openCrewApp')}</Link>
        </div>

        <InboxWidget
          notifications={inboxNotifications}
          automaticItems={accionRequerida.automaticItems}
          gestiones={accionRequerida.gestiones}
          officeProfiles={officeProfiles}
          currentProfile={currentProfile}
        />

        <DashboardCalendarWidget />

        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>🔧 {t('recentJobs')}</h2>
            <Link href="/trabajos/nuevo" className="btn btn-primary" style={{ fontSize: 13, padding: '7px 14px' }}>+ {t('newJob')}</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty">
              <div className="empty-glyph">🔧</div>
              <h3>{t('noJobsYet')}</h3>
              <p>{t('noJobsYetHint')}</p>
              <Link href="/trabajos/nuevo" className="btn btn-primary btn-sm">+ {t('createJob')}</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('table.job')}</th>
                    <th>{t('table.client')}</th>
                    <th>{t('table.location')}</th>
                    <th>{t('table.status')}</th>
                    <th>{t('table.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(j => {
                    const statusKey = statusBadgeCls[j.status] ? j.status : 'estimate';
                    const cls = statusBadgeCls[statusKey];
                    const label = t(`statusBadge.${statusKey}`);
                    const loc = jobLocation(j);
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}><Link href={`/trabajos/${j.id}`} style={{ color: 'inherit' }}>{j.title}</Link></td>
                        <td style={{ color: 'var(--muted)' }}>{j.clients?.name ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>
                          {loc ? (
                            (j.street || j.city) ? (
                              <a href={pickMapsLink(j.street, j.city, j.state, j.zip)} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--amber)', fontWeight: 600 }}>
                                📍 {loc}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>{loc}</span>
                            )
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td><span className={`badge ${cls}`}>{label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                          {j.scheduled_start ? formatDatePR(j.scheduled_start, {}, dateLocale) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stats-grid" style={{ marginTop: 20 }}>
          <div className="stat-card" data-accent={stats.caja >= 0 ? 'ok' : 'warn'}>
            <div className="stat-label">{t('stats.caja')}</div>
            <div className="stat-value" style={{ color: stats.caja >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmt(stats.caja)}</div>
            <div className="stat-sub">{t('stats.cajaSub')}</div>
          </div>
          <div className="stat-card" data-accent={stats.overdueCount > 0 ? 'warn' : 'amber'}>
            <div className="stat-label">{t('stats.pendingInvoices')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(stats.pendingTotal)}</div>
            <div className="stat-sub"><Link href="/accounting/facturas?status=sent" style={{ color: 'var(--amber)' }}>{t('stats.pendingCollect', { count: stats.pendingCount })}</Link></div>
            {stats.overdueCount > 0 && (
              <div className="stat-sub" style={{ color: 'var(--warn)' }}>
                <Link href="/accounting/facturas?status=overdue" style={{ color: 'var(--warn)' }}>
                  {t('stats.overdue', { count: stats.overdueCount, total: fmt(stats.overdueTotal) })}
                </Link>
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.clients')}</div>
            <div className="stat-value">{stats.clients}</div>
            <div className="stat-sub"><Link href="/clientes" style={{ color: 'var(--amber)' }}>{t('viewAll')}</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.totalJobs')}</div>
            <div className="stat-value">{stats.jobs}</div>
            <div className="stat-sub"><Link href="/trabajos" style={{ color: 'var(--amber)' }}>{t('viewAll')}</Link></div>
          </div>
          <div className="stat-card" data-accent="amber">
            <div className="stat-label">{t('stats.inProgress')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.activeJobs}</div>
            <div className="stat-sub">{t('stats.activeJobsToday')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.totalTickets')}</div>
            <div className="stat-value">{stats.tickets}</div>
            <div className="stat-sub"><Link href="/boletos" style={{ color: 'var(--amber)' }}>{t('viewAll')}</Link></div>
          </div>
          <div className="stat-card" data-accent="amber">
            <div className="stat-label">{t('stats.ticketsInProgress')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.activeTickets}</div>
            <div className="stat-sub"><Link href="/boletos" style={{ color: 'var(--amber)' }}>{t('viewAll')}</Link></div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>🔌 {t('integrations.title')}</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">{t('integrations.paypalPayments')}</div>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>{fmt(integrations.paypalTotal)}</div>
              <div className="stat-sub">{t('integrations.paymentCount', { count: integrations.paypalCount })}</div>
              {integrations.paypalRecent.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {p.invoices?.invoice_number ?? '—'} · {fmt(p.amount)} · {formatDatePR(p.paid_at, {}, dateLocale)}
                </div>
              ))}
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('integrations.acceptedEstimates')}</div>
              <div className="stat-value" style={{ color: 'var(--amber)' }}>{integrations.acceptedEstimates.length}</div>
              <div className="stat-sub">{t('integrations.pendingConversion')}</div>
              {integrations.acceptedEstimates.slice(0, 3).map(e => (
                <div key={e.id} style={{ fontSize: 12, marginTop: 4 }}>
                  <Link href={`/estimados/${e.id}`} style={{ color: 'var(--amber)', fontWeight: 600 }}>
                    {e.estimate_number} — {e.clients?.name ?? '—'} →
                  </Link>
                </div>
              ))}
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('integrations.lockedAccounts')}</div>
              <div className="stat-value" style={{ color: integrations.lockedProfiles.length > 0 ? 'var(--warn)' : undefined }}>
                {integrations.lockedProfiles.length}
              </div>
              <div className="stat-sub">{t('integrations.lockedAccountsSub')}</div>
              {integrations.lockedProfiles.slice(0, 3).map(p => (
                <div key={p.id} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {p.name ?? p.email} · {t('integrations.lockedUntil', { time: formatDateTimePR(p.locked_until, { hour: 'numeric', minute: '2-digit' }, dateLocale) })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
