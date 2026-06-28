export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

export default async function TrabajosPage() {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, clients(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Trabajos</div>
          <Link href="/trabajos/nuevo" className="btn btn-primary">+ Nuevo trabajo</Link>
        </div>
        <div className="card">
          {!jobs?.length ? (
            <div className="empty">
              <p>No hay trabajos aún. <Link href="/trabajos/nuevo" style={{ color: 'var(--amber)' }}>Crear el primero →</Link></p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trabajo</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Fecha programada</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const b = statusBadge[j.status] ?? statusBadge.estimate;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>{j.title}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.clients?.name ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                          {j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString('es-PR') : '—'}
                        </td>
                        <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
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
