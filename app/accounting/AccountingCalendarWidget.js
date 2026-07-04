import { supabaseServer as supabase } from '../../lib/supabase';
import AccountingCalendarClient from './AccountingCalendarClient';

export default async function AccountingCalendarWidget({ searchParams }) {
  const now = new Date();
  const year = parseInt(searchParams?.cyear ?? now.getFullYear());
  const month = parseInt(searchParams?.cmonth ?? now.getMonth());

  const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const [{ data: jobs }, { data: invoicesIssued }, { data: invoicesDue }, { data: payments }, { data: retenciones }] = await Promise.all([
    supabase.from('jobs').select('id, title, scheduled_start, scheduled_end, status, clients(name)')
      .gte('scheduled_start', `${monthStart}T00:00:00.000Z`).lte('scheduled_start', `${monthEnd}T23:59:59.999Z`),
    supabase.from('invoices').select('id, invoice_number, issued_at, clients(name)')
      .gte('issued_at', monthStart).lte('issued_at', monthEnd),
    supabase.from('invoices').select('id, invoice_number, due_at, clients(name)')
      .gte('due_at', monthStart).lte('due_at', monthEnd),
    supabase.from('payments').select('id, invoice_id, amount, paid_at, invoices(invoice_number, clients(name))')
      .gte('paid_at', monthStart).lte('paid_at', monthEnd),
    supabase.from('retenciones').select('id, client_id, fecha, retencion_aplicada, clients(name)')
      .gte('fecha', monthStart).lte('fecha', monthEnd),
  ]);

  return (
    <AccountingCalendarClient
      year={year}
      month={month}
      jobs={jobs ?? []}
      invoicesIssued={invoicesIssued ?? []}
      invoicesDue={invoicesDue ?? []}
      payments={payments ?? []}
      retenciones={retenciones ?? []}
    />
  );
}
