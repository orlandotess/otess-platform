export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import SolicitudTabs from './SolicitudTabs';

const statusBadge = {
  nueva:                { cls: 'badge-blue',  label: 'Nueva' },
  necesita_aprobacion:  { cls: 'badge-amber', label: 'Necesita aprobación' },
  evaluacion_completa:  { cls: 'badge-green', label: 'Evaluación completa' },
  convertida:           { cls: 'badge-dark',  label: 'Convertida' },
  archivada:            { cls: 'badge-gray',  label: 'Archivada' },
};

export default async function SolicitudDetail({ params }) {
  const { id } = params;

  const [{ data: solicitud }, { data: items }, { data: notes }] = await Promise.all([
    supabase.from('solicitudes').select('*, clients(name, email, phone, client_type, company), jobs:converted_to_job_id(id, job_number, title)').eq('id', id).single(),
    supabase.from('solicitud_line_items').select('*').eq('solicitud_id', id).order('sort_order'),
    supabase.from('solicitud_notes').select('*').eq('solicitud_id', id).order('created_at', { ascending: false }),
  ]);

  if (!solicitud) return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Solicitud no encontrada</div>
          <Link href="/solicitudes" className="btn btn-ghost">← Volver</Link>
        </div>
      </main>
    </div>
  );

  const [{ data: clientProperties }, { data: clientContacts }] = solicitud.client_id
    ? await Promise.all([
        supabase.from('client_properties').select('*').eq('client_id', solicitud.client_id).order('is_primary', { ascending: false }),
        supabase.from('client_contacts').select('*').eq('client_id', solicitud.client_id).order('is_primary', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

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

  const intakePhotoUrls = await Promise.all((solicitud.photo_urls ?? []).map(signPath));

  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async (item) => ({ ...item, photo_signed_url: await signPath(item.photo_url) }))
  );

  const notesWithSignedUrls = await Promise.all(
    (notes ?? []).map(async (note) => {
      if (note.photo_urls && note.photo_urls.length > 0) {
        const signedUrls = await Promise.all(note.photo_urls.map(p => signPath(p)));
        return { ...note, photo_urls: signedUrls.filter(Boolean), raw_photo_urls: note.photo_urls };
      }
      return note;
    })
  );

  const b = statusBadge[solicitud.status] ?? statusBadge.nueva;

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="page-title">{solicitud.title}</div>
              {solicitud.solicitud_number && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace', background: 'var(--amber-tint)', padding: '4px 10px', borderRadius: 8 }}>{solicitud.solicitud_number}</span>}
            </div>
            <span className={`badge ${b.cls}`} style={{ marginTop: 6, display: 'inline-block' }}>{b.label}</span>
            {solicitud.jobs && (
              <Link href={`/trabajos/${solicitud.jobs.id}`} style={{ marginLeft: 10, fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
                → Ver trabajo {solicitud.jobs.job_number}
              </Link>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/solicitudes" className="btn btn-ghost">← Solicitudes</Link>
          </div>
        </div>

        <SolicitudTabs
          solicitud={solicitud}
          items={itemsWithSignedUrls}
          notes={notesWithSignedUrls}
          intakePhotoUrls={intakePhotoUrls.filter(Boolean)}
          clientProperties={clientProperties ?? []}
          clientContacts={clientContacts ?? []}
        />
      </main>
    </div>
  );
}
