export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import ClientesTableClient from './ClientesTableClient';

export default async function ClientesPage() {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, client_type, email, phone, company')
    .order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Clientes</div>
          <Link href="/clientes/nuevo" className="btn btn-primary">+ Nuevo cliente</Link>
        </div>
        {!clients?.length ? (
          <div className="card">
            <div className="empty">
              <div className="empty-glyph">👥</div>
              <h3>No hay clientes aún</h3>
              <p>Cuando agregues un cliente, aparecerá aquí.</p>
              <Link href="/clientes/nuevo" className="btn btn-primary btn-sm">+ Agregar cliente</Link>
            </div>
          </div>
        ) : (
          <ClientesTableClient clients={clients} />
        )}
      </main>
    </div>
  );
}
