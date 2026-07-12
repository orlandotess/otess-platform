export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import Link from 'next/link';
import DashboardCalendarWidget from './DashboardCalendarWidget';

async function getStats() {
  const [clients, jobs, activeJobs, tickets, activeTickets, inboxTickets, { data: invoices }, { data: payments }, { data: expenses }] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('service_tickets').select('*', { count: 'exact', head: true }),
    supabase.from('service_tickets').select('*', { count: 'exact', head: true }).eq('status', 'en_progreso'),
    supabase.from('service_tickets').select('*', { count: 'exact', head: true }).eq('status', 'abierto'),
    supabase.from('invoices').select('id, total, status'),
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

  return {
    clients: clients.count ?? 0,
    jobs: jobs.count ?? 0,
    activeJobs: activeJobs.count ?? 0,
    tickets: tickets.count ?? 0,
    activeTickets: activeTickets.count ?? 0,
    inboxTickets: inboxTickets.count ?? 0,
    caja: totalCollected - totalExpenses,
    pendingTotal,
    pendingCount: pendingInvoices.length,
  };
}

async function getRecentJobs() {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, clients(name)')
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Home() {
  const [stats, recentJobs] = await Promise.all([getStats(), getRecentJobs()]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Dashboard</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              Bienvenido a OTESS Platform
            </p>
          </div>
          <Link href="/crew" className="btn btn-orange">📱 Abrir Crew App</Link>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Caja</div>
            <div className="stat-value" style={{ color: stats.caja >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmt(stats.caja)}</div>
            <div className="stat-sub">Cobrado − gastos</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Facturas pendientes</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(stats.pendingTotal)}</div>
            <div className="stat-sub"><Link href="/accounting/facturas" style={{ color: 'var(--amber)' }}>{stats.pendingCount} por cobrar →</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Clientes</div>
            <div className="stat-value">{stats.clients}</div>
            <div className="stat-sub"><Link href="/clientes" style={{ color: 'var(--amber)' }}>Ver todos →</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Trabajos totales</div>
            <div className="stat-value">{stats.jobs}</div>
            <div className="stat-sub"><Link href="/trabajos" style={{ color: 'var(--amber)' }}>Ver todos →</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En progreso</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.activeJobs}</div>
            <div className="stat-sub">Trabajos activos hoy</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Boletos totales</div>
            <div className="stat-value">{stats.tickets}</div>
            <div className="stat-sub"><Link href="/boletos" style={{ color: 'var(--amber)' }}>Ver todos →</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Boletos en progreso</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.activeTickets}</div>
            <div className="stat-sub"><Link href="/boletos" style={{ color: 'var(--amber)' }}>Ver todos →</Link></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bandeja de entrada</div>
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{stats.inboxTickets}</div>
            <div className="stat-sub"><Link href="/boletos" style={{ color: 'var(--amber)' }}>Ver todos →</Link></div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Trabajos recientes</h2>
            <Link href="/trabajos/nuevo" className="btn btn-primary" style={{ fontSize: 13, padding: '7px 14px' }}>+ Nuevo trabajo</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty">
              <div className="empty-glyph">🔧</div>
              <h3>No hay trabajos aún</h3>
              <p>Cuando crees un trabajo para un cliente, aparecerá aquí.</p>
              <Link href="/trabajos/nuevo" className="btn btn-primary btn-sm">+ Crear trabajo</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trabajo</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(j => {
                    const b = statusBadge[j.status] ?? statusBadge.estimate;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>{j.title}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                          {j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString('es-PR') : '—'}
                        </td>
                        <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DashboardCalendarWidget />
      </main>
    </div>
  );
}
