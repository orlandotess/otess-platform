export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import { formatDuration, formatMs } from '../../lib/formatDuration';

const statusBadge = {
  abierto:      { cls: 'badge-red',   label: 'Abierto' },
  en_progreso:  { cls: 'badge-blue',  label: 'En progreso' },
  cerrado:      { cls: 'badge-gray',  label: 'Cerrado' },
};

export default async function BoletosPage() {
  const { data: tickets } = await supabase
    .from('service_tickets')
    .select('id, subject, status, source, contact_email, created_at, resolved_at, updated_at, clients(name, company), technicians(name)')
    .order('created_at', { ascending: false });

  const abiertos = tickets?.filter(t => t.status === 'abierto').length ?? 0;
  const enProgreso = tickets?.filter(t => t.status === 'en_progreso').length ?? 0;
  const sinAsignar = tickets?.filter(t => !t.clients).length ?? 0;

  const resolvedTickets = tickets?.filter(t => t.status === 'cerrado') ?? [];
  const avgResolutionMs = resolvedTickets.length
    ? resolvedTickets.reduce((sum, t) => sum + (new Date(t.resolved_at ?? t.updated_at) - new Date(t.created_at)), 0) / resolvedTickets.length
    : null;
  const avgResolution = avgResolutionMs != null ? formatMs(avgResolutionMs) : null;

  return (
    <div className="admin-shell ds-boletos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Boletos de servicio</div>
          <Link href="/boletos/nuevo" className="btn btn-primary">+ Abrir boleto</Link>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Total boletos</div>
            <div className="stat-value">{tickets?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Abiertos</div>
            <div className="stat-value" style={{ color: 'var(--warn)', fontSize: 22 }}>{abiertos}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En progreso</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>{enProgreso}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Sin asignar</div>
            <div className="stat-value" style={{ color: sinAsignar ? 'var(--warn)' : 'var(--muted)', fontSize: 22 }}>{sinAsignar}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tiempo prom. de resolución</div>
            <div className="stat-value" style={{ color: 'var(--muted)', fontSize: 22 }}>{avgResolution ?? '—'}</div>
          </div>
        </div>

        <div className="card">
          {!tickets?.length ? (
            <div className="empty">
              <div className="empty-glyph">🎫</div>
              <h3>No hay boletos aún</h3>
              <p>Cuando un cliente reporte un problema, o abras uno manualmente, aparecerá aquí.</p>
              <Link href="/boletos/nuevo" className="btn btn-primary btn-sm">+ Abrir boleto</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Problema</th>
                    <th>Origen</th>
                    <th>Técnico</th>
                    <th>Estado</th>
                    <th>Tiempo</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => {
                    const b = statusBadge[t.status] ?? statusBadge.abierto;
                    const elapsed = t.status === 'cerrado'
                      ? formatDuration(t.created_at, t.resolved_at ?? t.updated_at)
                      : formatDuration(t.created_at, new Date().toISOString());
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>
                          {t.clients?.company || t.clients?.name || (
                            <span style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠️ {t.contact_email ?? 'Sin asignar'}</span>
                          )}
                        </td>
                        <td>{t.subject}</td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {t.source === 'email' ? '📧 Email' : '👤 Manual'}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: t.technicians ? 'var(--text)' : 'var(--muted)' }}>{t.technicians?.name ?? '— Sin asignar —'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{elapsed ?? '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(t.created_at).toLocaleDateString('es-PR')}</td>
                        <td><Link href={`/boletos/${t.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
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
