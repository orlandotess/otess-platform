export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import JobTabs from './JobTabs';

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

export default async function TrabajoDetail({ params }) {
  const { id } = params;

  const [{ data: job }, { data: items }, { data: technicians }, { data: notes }, { data: checklist }, { data: templates }, { data: jobTechnicians }, { data: scheduleDays }, { data: expenses }] = await Promise.all([
    supabase.from('jobs').select('*, clients(name, email, phone, client_type, company), client_addresses(*), client_properties(*), client_contacts(*)').eq('id', id).single(),
    supabase.from('job_line_items').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('technicians').select('*').order('name'),
    supabase.from('job_notes').select('*').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('job_checklist_items').select('*').eq('job_id', id).order('sort_order'),
    supabase.from('checklist_templates').select('*, checklist_template_items(*)').order('name'),
    supabase.from('job_technicians').select('*, technicians(name)').eq('job_id', id),
    supabase.from('job_schedule_days').select('*, technicians(name)').eq('job_id', id).order('scheduled_start'),
    supabase.from('expenses').select('*').eq('job_id', id).order('expense_date', { ascending: false }),
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

  // Full lists (not just the one linked via property_id/contact_id) so the
  // job editor can offer a searchable selector over all of the client's
  // properties/contacts, not just the one currently assigned.
  const [{ data: clientProperties }, { data: clientContacts }] = job.client_id
    ? await Promise.all([
        supabase.from('client_properties').select('*').eq('client_id', job.client_id).order('is_primary', { ascending: false }),
        supabase.from('client_contacts').select('*').eq('client_id', job.client_id).order('is_primary', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  // Generate signed URLs for notes with photos (1 hour expiry)
  async function signPath(rawPath) {
    if (!rawPath) return null;
    try {
      let filePath = rawPath;
      if (rawPath.startsWith('http')) {
        const url = new URL(rawPath);
        const pathParts = url.pathname.split('/Job-photos/');
        filePath = pathParts[1];
        if (!filePath) return null;
      }
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(filePath, 3600);
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  }

  const notesWithSignedUrls = await Promise.all(
    (notes ?? []).map(async (note) => {
      if (note.photo_urls && note.photo_urls.length > 0) {
        const signedUrls = await Promise.all(note.photo_urls.map(p => signPath(p)));
        return { ...note, photo_urls: signedUrls.filter(Boolean), photo_url: signedUrls[0] ?? null, raw_photo_urls: note.photo_urls, raw_photo_url: note.photo_url };
      }
      if (!note.photo_url) return note;
      const signedUrl = await signPath(note.photo_url);
      return { ...note, photo_url: signedUrl, raw_photo_url: note.photo_url };
    })
  );

  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async (item) => ({ ...item, photo_signed_url: await signPath(item.photo_url) }))
  );

  const expensesWithSignedUrls = await Promise.all(
    (expenses ?? []).map(async (exp) => ({ ...exp, receipt_signed_url: await signPath(exp.receipt_url) }))
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
          items={itemsWithSignedUrls}
          technicians={technicians ?? []}
          notes={notesWithSignedUrls}
          checklist={checklist ?? []}
          templates={templates ?? []}
          clientType={clientType}
          totals={{ subProd, taxProd, subLabor, taxLabor, total }}
          jobTechnicians={jobTechnicians ?? []}
          clientProperties={clientProperties ?? []}
          clientContacts={clientContacts ?? []}
          scheduleDays={scheduleDays ?? []}
          expenses={expensesWithSignedUrls}
        />
      </main>
    </div>
  );
}
