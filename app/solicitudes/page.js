export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import SolicitudesTableClient from './SolicitudesTableClient';

export default async function SolicitudesPage() {
  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('id, solicitud_number, title, status, requested_on, assessment_date, property_name, street, city, state, zip, clients(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Solicitudes</div>
          <Link href="/solicitudes/nuevo" className="btn btn-primary">+ Nueva solicitud</Link>
        </div>
        {!solicitudes?.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">📥</div>
              <h3>No hay solicitudes aún</h3>
              <p>Cuando un cliente pida un servicio, regístralo aquí antes de convertirlo en trabajo.</p>
              <Link href="/solicitudes/nuevo" className="btn btn-primary btn-sm">+ Crear solicitud</Link>
            </div>
          </div>
        ) : (
          <SolicitudesTableClient solicitudes={solicitudes} />
        )}
      </main>
    </div>
  );
}
