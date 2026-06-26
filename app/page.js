import { supabase } from '../lib/supabase';
import Sidebar from './Sidebar';
import Link from 'next/link';

async function getStats() {
  const [clients, jobs, activeJobs] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
  ]);
  return {
    clients: clients.count ?? 0,
    jobs: jobs.count ?? 0,
    activeJobs: activeJobs.count ?? 0,
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
          <Link href="/field" className="btn btn-orange">📱 Abrir Field App</Link>
        </div>

        <div className="stats-grid">
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
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Trabajos recientes</h2>
            <Link href="/trabajos/nuevo" className="btn btn-primary" style={{ fontSize: 13, padding: '7px 14px' }}>+ Nuevo trabajo</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty">
              <p>No hay trabajos aún. <Link href="/trabajos/nuevo" style={{ color: 'var(--amber)' }}>Crea el primero →</Link></p>
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
      </main>
    </div>
  );
}
