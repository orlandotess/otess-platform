export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../../lib/supabase';
import Sidebar from '../../../Sidebar';
import RecurringInvoiceDetailClient from './RecurringInvoiceDetailClient';

export default async function FacturaRecurrenteDetailPage({ params }) {
  const [{ data: recurring }, { data: clients }, { data: history }] = await Promise.all([
    supabase.from('recurring_invoices').select('*, clients(name, email, company, client_type), recurring_invoice_items(*)').eq('id', params.id).single(),
    supabase.from('clients').select('id, name, company, client_type, email').order('name'),
    supabase.from('invoices').select('id, invoice_number, status, total, issued_at, due_at').eq('recurring_invoice_id', params.id).order('issued_at', { ascending: false }),
  ]);

  if (!recurring) {
    return (
      <div className="admin-shell ds-facturas">
        <Sidebar />
        <main className="main-content">
          <p>Factura recurrente no encontrada.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <RecurringInvoiceDetailClient recurring={recurring} clients={clients ?? []} history={history ?? []} />
      </main>
    </div>
  );
}
