export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import ClientesDetail from './ClientesDetail';

export default async function ClienteDetailPage({ params }) {
  const { id } = params;

  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  let currentRole = 'tecnico';
  if (user?.email) {
    const { data: myProfile } = await supabase.from('profiles').select('role').eq('email', user.email).single();
    currentRole = myProfile?.role ?? 'tecnico';
  }

  const [{ data: client }, { data: jobs }, { data: invoices }, { data: properties }, { data: contacts }, { data: proposals }, { data: internalNotes }, { data: serviceTickets }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('jobs').select('id, title, status, scheduled_start, scheduled_end, property_id, contact_id, technician_id, technicians(id, name), job_technicians(technician_id, technicians(name))').eq('client_id', id).order('scheduled_start', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, total, status, created_at, job_id').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('client_properties').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('proposals').select('id, proposal_number, title, status, created_at, valid_until, proposal_options(id, name, proposal_line_items(quantity, unit_price))').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('service_tickets').select('id, subject, status, source, created_at').eq('client_id', id).order('created_at', { ascending: false }),
  ]);

  const invoiceIds = (invoices ?? []).map(i => i.id);
  const jobIds = (jobs ?? []).map(j => j.id);
  const [{ data: payments }, { data: retenciones }, { data: scheduleDayRows }, { data: calendarEvents }, { data: tasks }] = await Promise.all([
    invoiceIds.length ? supabase.from('payments').select('id, invoice_id, amount, paid_at').in('invoice_id', invoiceIds) : Promise.resolve({ data: [] }),
    supabase.from('retenciones').select('id, invoice_id, retencion_aplicada, fecha').eq('client_id', id),
    // Extra work days for jobs spanning multiple (possibly non-consecutive) days -
    // each renders as its own schedule entry alongside the job's main date.
    jobIds.length ? supabase.from('job_schedule_days').select('id, job_id, scheduled_start, scheduled_end, technician_id, technicians(name)').in('job_id', jobIds) : Promise.resolve({ data: [] }),
    supabase.from('calendar_events').select('id, title, notes, address, start_at, end_at, technician_id, technicians(name), calendar_event_technicians(technician_id, technicians(name))').eq('client_id', id),
    supabase.from('tasks').select('id, task_type, title, notes, due_at, technician_id, completed, technicians(name)').eq('client_id', id),
  ]);

  const paymentsByInvoice = {};
  (payments ?? []).forEach(p => { paymentsByInvoice[p.invoice_id] = (paymentsByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0); });
  const retenidoByInvoice = {};
  (retenciones ?? []).forEach(r => { if (r.invoice_id) retenidoByInvoice[r.invoice_id] = (retenidoByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0); });
  const totalRetenido = (retenciones ?? []).reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0);

  // Same expected-net check as Cliente 360, scoped to this one client - only
  // paid invoices settle for real, so unpaid/draft ones are excluded to avoid
  // a false mismatch (billed and retained, but nothing collected yet).
  const cobrado = (invoices ?? []).reduce((a, i) => a + (paymentsByInvoice[i.id] ?? 0), 0);
  const paidInvoices = (invoices ?? []).filter(i => i.status === 'paid');
  const facturadoPagado = paidInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
  const retenidoPagado = paidInvoices.reduce((a, i) => a + (retenidoByInvoice[i.id] ?? 0), 0);
  const netoEsperado = facturadoPagado - retenidoPagado;
  const varianza = cobrado - netoEsperado;
  const hasVarianza = paidInvoices.length > 0 && Math.abs(varianza) > 0.01;

  // What the client still owes across every invoice, net of its own payments
  // and retenciones - same per-invoice math as the "Balance de cuenta" shown
  // on individual invoice pages, just summed across all of them here.
  const balanceDeCuenta = (invoices ?? []).reduce((a, i) => {
    const remaining = Number(i.total ?? 0) - (paymentsByInvoice[i.id] ?? 0) - (retenidoByInvoice[i.id] ?? 0);
    return a + Math.max(remaining, 0);
  }, 0);

  if (!client) return (
    <div className="admin-shell ds-clientes">
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
    <div className="admin-shell ds-clientes">
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
          payments={payments ?? []}
          retenciones={retenciones ?? []}
          scheduleDays={scheduleDayRows ?? []}
          calendarEvents={calendarEvents ?? []}
          tasks={tasks ?? []}
          properties={properties ?? []}
          contacts={contacts ?? []}
          proposals={proposals ?? []}
          internalNotes={internalNotes ?? []}
          serviceTickets={serviceTickets ?? []}
          currentRole={currentRole}
          invoiceReconciliation={{ cobrado, netoEsperado, varianza, hasVarianza, totalRetenido, balanceDeCuenta }}
        />
      </main>
    </div>
  );
}
