export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import TrabajosTableClient from './TrabajosTableClient';

export default async function TrabajosPage() {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, property_name, street, city, state, zip, clients(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="admin-shell ds-trabajos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Trabajos</div>
          <Link href="/trabajos/nuevo" className="btn btn-primary">+ Nuevo trabajo</Link>
        </div>
        {!jobs?.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">🔧</div>
              <h3>No hay trabajos aún</h3>
              <p>Cuando crees un trabajo para un cliente, aparecerá aquí.</p>
              <Link href="/trabajos/nuevo" className="btn btn-primary btn-sm">+ Crear trabajo</Link>
            </div>
          </div>
        ) : (
          <TrabajosTableClient jobs={jobs} />
        )}
      </main>
    </div>
  );
}
