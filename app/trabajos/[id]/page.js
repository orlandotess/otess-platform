export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import JobTabs from './JobTabs';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

export default async function TrabajoDetail({ params }) {
  const { id } = params;

  const [{ data: job }, { data: items }, { data: technicians }, { data: notes }, { data: checklist }, { data: templates }] = await Promise.all([
    supabase.from('jobs').select('*, clients(name, email, phone, client_type), client_addresses(*)').eq('id', id).single(),
    supabase.from('job_line_items').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('technicians').select('*').order('name'),
    supabase.from('job_notes').select('*').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('job_checklist_items').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('checklist_templates').select('*, checklist_template_items(*)').order('name'),
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
  const fmt = n => `$${Number(n).toFixed(2)}`;
  const b = statusBadge[job.status] ?? statusBadge.estimate;

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
          </div>
        </div>

        <JobTabs
          job={job}
          items={items ?? []}
          technicians={technicians ?? []}
          notes={notes ?? []}
          checklist={checklist ?? []}
          templates={templates ?? []}
          clientType={clientType}
          totals={{ subProd, taxProd, subLabor, taxLabor, total }}
        />
      </main>
    </div>
  );
}
