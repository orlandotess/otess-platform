export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import ClientesDetail from './ClientesDetail';

export default async function ClienteDetailPage({ params }) {
  const { id } = params;

  const [{ data: client }, { data: jobs }, { data: invoices }, { data: properties }, { data: contacts }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('jobs').select('id, title, status, scheduled_start, property_id, contact_id').eq('client_id', id).order('scheduled_start', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, total, status, created_at').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('client_properties').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
  ]);

  if (!client) return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Cliente no encontrado</div>
          <Link href="/clientes" className="btn btn-ghost">← Volver</Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{client.name}</div>
            {client.company && <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>{client.company}</div>}
            <span className={`badge ${client.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {client.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/clientes" className="btn btn-ghost">← Clientes</Link>
            <Link href={`/trabajos/nuevo?client=${id}`} className="btn btn-primary">🔧 Nuevo trabajo</Link>
          </div>
        </div>

        <ClientesDetail
          client={client}
          jobs={jobs ?? []}
          invoices={invoices ?? []}
          properties={properties ?? []}
          contacts={contacts ?? []}
        />
      </main>
    </div>
  );
}
