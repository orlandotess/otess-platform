'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

const statusJob = { estimate: { cls: 'badge-gray', label: 'Estimado' }, scheduled: { cls: 'badge-blue', label: 'Programado' }, in_progress: { cls: 'badge-amber', label: 'En progreso' }, completed: { cls: 'badge-green', label: 'Completado' }, cancelled: { cls: 'badge-red', label: 'Cancelado' } };
const statusInv = { draft: { cls: 'badge-gray', label: 'Borrador' }, sent: { cls: 'badge-blue', label: 'Enviada' }, paid: { cls: 'badge-green', label: 'Pagada' }, overdue: { cls: 'badge-red', label: 'Vencida' } };
const fmt = n => `$${Number(n ?? 0).toFixed(2)}`;

export default function ClienteDetail({ client, jobs, invoices }) {
  const router = useRouter();
  const [tab, setTab] = useState('info');
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteClient() {
    setDeleting(true);
    await supabase.from('clients').delete().eq('id', client.id);
    router.push('/clientes');
  }

  const tabStyle = t => ({
    padding: '10px 20px',
    fontWeight: tab === t ? 700 : 500,
    color: tab === t ? 'var(--navy)' : 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent',
    fontSize: 14,
  });

  const primaryAddress = client.client_addresses?.find(a => a.is_primary) ?? client.client_addresses?.[0];

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: '#fff', borderRadius: '12px 12px 0 0', padding: '0 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>👤 Info</button>
        <button style={tabStyle('jobs')} onClick={() => setTab('jobs')}>
          🔧 Trabajos {jobs.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{jobs.length}</span>}
        </button>
        <button style={tabStyle('invoices')} onClick={() => setTab('invoices')}>
          🧾 Facturas {invoices.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{invoices.length}</span>}
        </button>
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Información de contacto</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Nombre', value: client.name },
                  { label: 'Empresa', value: client.company },
                  { label: 'Email', value: client.email },
                  { label: 'Teléfono', value: client.phone },
                ].map(f => f.value ? (
                  <div key={f.label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ fontSize: 14 }}>{f.value}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {primaryAddress && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Dirección principal</p>
                <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                  {primaryAddress.street && <div>{primaryAddress.street}</div>}
                  {primaryAddress.city && <div>{primaryAddress.city}{primaryAddress.state ? `, ${primaryAddress.state}` : ''} {primaryAddress.zip}</div>}
                </div>
              </div>
            )}

            {client.notes && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>Notas</p>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{client.notes}</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen</p>
              {[
                { label: 'Trabajos totales', value: jobs.length },
                { label: 'Facturas totales', value: invoices.length },
                { label: 'Total facturado', value: fmt(invoices.reduce((a, i) => a + Number(i.total ?? 0), 0)) },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>

            <Link href={`/trabajos/nuevo?client=${client.id}`} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              🔧 Nuevo trabajo
            </Link>

            <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5', justifyContent: 'center' }} onClick={() => setShowDelete(true)}>
              🗑 Eliminar cliente
            </button>
          </div>
        </div>
      )}

      {/* JOBS TAB */}
      {tab === 'jobs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Trabajos</h2>
            <Link href={`/trabajos/nuevo?client=${client.id}`} className="btn btn-primary">+ Nuevo trabajo</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="empty"><p>No hay trabajos para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Título</th><th>Estado</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const b = statusJob[j.status] ?? statusJob.estimate;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>{j.title}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString('es-PR') : '—'}</td>
                        <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INVOICES TAB */}
      {tab === 'invoices' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Facturas</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="empty"><p>No hay facturas para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Número</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusInv[inv.status] ?? statusInv.draft;
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600 }}>{inv.invoice_number ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(inv.created_at).toLocaleDateString('es-PR')}</td>
                        <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar cliente?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente y eliminará todos los datos del cliente.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={deleteClient} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
