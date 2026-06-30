export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import JobTabs from './JobTabs';

// Service role client for generating signed URLs
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
    supabase.from('jobs').select('*, clients(name, email, phone, client_type), client_addresses(*), client_properties(*), client_contacts(*)').eq('id', id).single(),
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

  // Generate signed URLs for notes with photos (1 hour expiry)
  const notesWithSignedUrls = await Promise.all(
    (notes ?? []).map(async (note) => {
      if (!note.photo_url) return note;
      try {
        // Handle both old full URLs and new path-only format
        let filePath = note.photo_url;
        if (note.photo_url.startsWith('http')) {
          const url = new URL(note.photo_url);
          const pathParts = url.pathname.split('/Job-photos/');
          filePath = pathParts[1];
          if (!filePath) return note;
        }
        const { data, error } = await supabaseAdmin.storage
          .from('Job-photos')
          .createSignedUrl(filePath, 3600);
        console.log('Signed URL result:', { filePath, signedUrl: data?.signedUrl, error });
        return { ...note, photo_url: data?.signedUrl ?? null };
      } catch (err) {
        console.error('Signed URL error:', err);
        return { ...note, photo_url: null };
      }
    })
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

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="page-title">{job.title}</div>
              {job.job_number && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace', background: '#fff3e0', padding: '4px 10px', borderRadius: 8 }}>{job.job_number}</span>}
            </div>
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
          notes={notesWithSignedUrls}
          checklist={checklist ?? []}
          templates={templates ?? []}
          clientType={clientType}
          totals={{ subProd, taxProd, subLabor, taxLabor, total }}
        />
      </main>
    </div>
  );
}
