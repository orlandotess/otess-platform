export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import JobActions from './JobActions';

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

export default async function TrabajoDetail({ params }) {
  const { id } = params;

  const [{ data: job }, { data: items }, { data: technicians }] = await Promise.all([
    supabase.from('jobs').select('*, clients(name, email, phone, client_type), client_addresses(*)').eq('id', id).single(),
    supabase.from('job_line_items').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('technicians').select('*').order('name'),
  ]);

  if (!job) return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Trabajo no encontrado</div>
          <Link href="/trabajos" className="btn btn-ghost">← Volver</Link>
        </div>
      </main>
    </div>
  );

  const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };
  const clientType = job.clients?.client_type ?? 'final';

  let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
  items?.forEach(it => {
    const base = Number(it.quantity) * Number(it.unit_price);
    const rate = TAX[`${clientType}_${it.type}`] ?? 0.115;
    if (it.type === 'product') { subProd += base; taxProd += base * rate; }
    else { subLabor += base; taxLabor += base * rate; }
  });
  const total = subProd + taxProd + subLabor + taxLabor;

  const b = statusBadge[job.status] ?? statusBadge.estimate;
  const fmt = n => `$${Number(n).toFixed(2)}`;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{job.title}</div>
            <span className={`badge ${b.cls}`} style={{ marginTop: 6, display: 'inline-block' }}>{b.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/trabajos" className="btn btn-ghost">← Trabajos</Link>
            <Link href={`/facturas/nueva?job=${job.id}`} className="btn btn-amber">🧾 Crear factura</Link>
            <JobActions jobId={id} status={job.status} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Client info */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Cliente</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{job.clients?.name}</div>
                  {job.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{job.clients.email}</div>}
                  {job.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{job.clients.phone}</div>}
                  <span className={`badge ${job.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`} style={{ marginTop: 8, display: 'inline-block' }}>
                    {job.clients?.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
                  </span>
                </div>
                <Link href={`/clientes/${job.client_id}`} style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}>Ver cliente →</Link>
              </div>
            </div>

            {/* Job info */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Detalles del trabajo</p>
              {job.description && <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>{job.description}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {job.scheduled_start && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Inicio</div>
                    <div style={{ fontSize: 14 }}>{new Date(job.scheduled_start).toLocaleString('es-PR')}</div>
                  </div>
                )}
                {job.scheduled_end && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Fin</div>
                    <div style={{ fontSize: 14 }}>{new Date(job.scheduled_end).toLocaleString('es-PR')}</div>
                  </div>
                )}
              </div>
              {job.notes && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8f9fb', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {job.notes}
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Líneas de trabajo</p>
              {!items?.length ? (
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>No hay líneas agregadas.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Tipo</th>
                      <th style={{ textAlign: 'right' }}>Cant.</th>
                      <th style={{ textAlign: 'right' }}>Precio</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id}>
                        <td style={{ fontWeight: 500 }}>{it.description}</td>
                        <td><span className={`badge ${it.type === 'labor' ? 'badge-amber' : 'badge-gray'}`}>{it.type === 'labor' ? 'Labor' : 'Producto'}</span></td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(it.unit_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(it.quantity) * Number(it.unit_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Summary sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen IVU</p>
              {clientType === 'b2b' && (
                <div style={{ background: '#e8eeff', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#2a4cb5', fontWeight: 600 }}>
                  Cliente B2B — Labor al 4%
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                {[
                  { label: 'Subtotal productos', value: subProd },
                  { label: 'IVU productos (11.5%)', value: taxProd },
                  { label: 'Subtotal labor', value: subLabor },
                  { label: `IVU labor (${clientType === 'b2b' ? '4%' : '11.5%'})`, value: taxLabor },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, paddingTop: 4 }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--navy)' }}>{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Technicians */}
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Técnicos asignados</p>
              <JobActions jobId={id} status={job.status} showTechOnly technicians={technicians} currentTechId={job.technician_id} />
            </div>

            <Link href={`/facturas/nueva?job=${job.id}`} className="btn btn-amber" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15 }}>
              🧾 Crear factura para este trabajo
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
