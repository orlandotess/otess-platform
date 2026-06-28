export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import ClienteDetail from './ClientesDetail';

const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
);

export default async function ClienteDetailPage({ params }) {
  const { id } = params;

  const [{ data: client }, { data: jobs }, { data: invoices }] = await Promise.all([
    supabase.from('clients').select('*, client_addresses(*)').eq('id', id).single(),
    supabase.from('jobs').select('id, title, status, scheduled_start').eq('client_id', id).order('scheduled_start', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, total, status, created_at').eq('client_id', id).order('created_at', { ascending: false }),
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
            <span className={`badge ${client.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {client.client_type === 'b2b' ? 'B2B' : 'Consumidor final'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/clientes" className="btn btn-ghost">← Clientes</Link>
            <Link href={`/clientes/${id}/editar`} className="btn btn-primary">✏️ Editar</Link>
          </div>
        </div>

        <ClienteDetail client={client} jobs={jobs ?? []} invoices={invoices ?? []} />
      </main>
    </div>
  );
}
