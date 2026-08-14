export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import { formatDuration, formatMs } from '../../lib/formatDuration';
import { formatDatePR } from '../../lib/datetimeLocal';
import { getTranslations, getLocale } from 'next-intl/server';

const statusBadgeDefs = {
  abierto:      { cls: 'badge-red',   key: 'open' },
  en_progreso:  { cls: 'badge-blue',  key: 'inProgress' },
  cerrado:      { cls: 'badge-gray',  key: 'closed' },
};

export default async function BoletosPage() {
  const t = await getTranslations('boletos.list');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  const { data: tickets } = await supabase
    .from('service_tickets')
    .select('id, ticket_number, subject, status, source, contact_email, created_at, resolved_at, updated_at, clients(name, company), technicians(name)')
    .order('created_at', { ascending: false });

  const statusBadge = Object.fromEntries(
    Object.entries(statusBadgeDefs).map(([k, v]) => [k, { cls: v.cls, label: t(`status.${v.key}`) }])
  );

  const abiertos = tickets?.filter(tk => tk.status === 'abierto').length ?? 0;
  const enProgreso = tickets?.filter(tk => tk.status === 'en_progreso').length ?? 0;
  const sinAsignar = tickets?.filter(tk => !tk.clients).length ?? 0;

  const resolvedTickets = tickets?.filter(tk => tk.status === 'cerrado') ?? [];
  const avgResolutionMs = resolvedTickets.length
    ? resolvedTickets.reduce((sum, tk) => sum + (new Date(tk.resolved_at ?? tk.updated_at) - new Date(tk.created_at)), 0) / resolvedTickets.length
    : null;
  const avgResolution = avgResolutionMs != null ? formatMs(avgResolutionMs) : null;

  return (
    <div className="admin-shell ds-boletos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <Link href="/boletos/nuevo" className="btn btn-primary">{t('newTicket')}</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.total')}</div>
            <div className="stat-value">{tickets?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.open')}</div>
            <div className="stat-value" style={{ color: 'var(--warn)', fontSize: 22 }}>{abiertos}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.inProgress')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>{enProgreso}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.unassigned')}</div>
            <div className="stat-value" style={{ color: sinAsignar ? 'var(--warn)' : 'var(--muted)', fontSize: 22 }}>{sinAsignar}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.avgResolutionTime')}</div>
            <div className="stat-value" style={{ color: 'var(--muted)', fontSize: 22 }}>{avgResolution ?? '—'}</div>
          </div>
        </div>

        <div className="card">
          {!tickets?.length ? (
            <div className="empty">
              <div className="empty-glyph">🎫</div>
              <h3>{t('emptyTitle')}</h3>
              <p>{t('emptyText')}</p>
              <Link href="/boletos/nuevo" className="btn btn-primary btn-sm">{t('newTicket')}</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('columns.number')}</th>
                    <th>{t('columns.client')}</th>
                    <th>{t('columns.problem')}</th>
                    <th>{t('columns.source')}</th>
                    <th>{t('columns.technician')}</th>
                    <th>{t('columns.status')}</th>
                    <th>{t('columns.time')}</th>
                    <th>{t('columns.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(tk => {
                    const b = statusBadge[tk.status] ?? statusBadge.abierto;
                    const elapsed = tk.status === 'cerrado'
                      ? formatDuration(tk.created_at, tk.resolved_at ?? tk.updated_at)
                      : formatDuration(tk.created_at, new Date().toISOString());
                    return (
                      <tr key={tk.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'monospace' }}><Link href={`/boletos/${tk.id}`} style={{ color: 'inherit' }}>{tk.ticket_number ?? '—'}</Link></td>
                        <td style={{ fontWeight: 600 }}>
                          {tk.clients?.company || tk.clients?.name || (
                            <span style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠️ {tk.contact_email ?? t('unassigned')}</span>
                          )}
                        </td>
                        <td>{tk.subject}</td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {tk.source === 'email' ? t('sourceEmail') : t('sourceManual')}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: tk.technicians ? 'var(--text)' : 'var(--muted)' }}>{tk.technicians?.name ?? t('technicianUnassigned')}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{elapsed ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{formatDatePR(tk.created_at, {}, dateLocale)}</td>
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
