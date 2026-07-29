export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import SolicitudesTableClient from './SolicitudesTableClient';

export default async function SolicitudesPage({ searchParams }) {
  const showArchived = searchParams?.archived === '1';

  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('id, solicitud_number, title, status, requested_on, assessment_date, archived_at, property_name, street, city, state, zip, clients(name), technicians(name), solicitud_technicians(technicians(name))')
    .order('created_at', { ascending: false });

  const archivedCount = (solicitudes ?? []).filter(s => s.archived_at).length;
  const visible = (solicitudes ?? []).filter(s => showArchived ? !!s.archived_at : !s.archived_at);

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Solicitudes</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {showArchived ? (
              <Link href="/solicitudes" className="btn btn-ghost">← Ver activas</Link>
            ) : (
              <Link href="/solicitudes?archived=1" className="btn btn-ghost">📦 Ver archivadas{archivedCount ? ` (${archivedCount})` : ''}</Link>
            )}
            <Link href="/solicitudes/nuevo" className="btn btn-primary">+ Nueva solicitud</Link>
          </div>
        </div>
        {!visible.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">📥</div>
              <h3>{showArchived ? 'No hay solicitudes archivadas' : 'No hay solicitudes aún'}</h3>
              <p>{showArchived ? 'Las solicitudes que archives aparecerán aquí.' : 'Cuando un cliente pida un servicio, regístralo aquí antes de convertirlo en trabajo.'}</p>
              {!showArchived && <Link href="/solicitudes/nuevo" className="btn btn-primary btn-sm">+ Crear solicitud</Link>}
            </div>
          </div>
        ) : (
          <SolicitudesTableClient solicitudes={visible} />
        )}
      </main>
    </div>
  );
}
