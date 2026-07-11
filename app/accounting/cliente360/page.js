export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import Cliente360Client from './Cliente360Client';

export default async function Cliente360Page() {
  const [{ data: clients }, { data: invoices }, { data: payments }, { data: lines }, { data: retenciones }] = await Promise.all([
    supabase.from('clients').select('id, name, company, client_type').order('name'),
    supabase.from('invoices').select('id, client_id, invoice_number, issued_at, status, total, subtotal_labor, tax_labor, subtotal_products, tax_products, clients(name, client_type)').order('issued_at', { ascending: false }),
    supabase.from('payments').select('invoice_id, amount'),
    supabase.from('invoice_line_items').select('invoice_id, type, tax_rate, tax_amount'),
    supabase.from('retenciones').select('client_id, invoice_id, retencion_aplicada'),
  ]);

  const invs = invoices ?? [];
  const paymentsByInvoice = {};
  (payments ?? []).forEach(p => {
    if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = 0;
    paymentsByInvoice[p.invoice_id] += Number(p.amount ?? 0);
  });

  // Per-invoice IVU breakdown (same convention as /accounting/ivu)
  const ivuByInvoice = {};
  (lines ?? []).forEach(l => {
    if (!ivuByInvoice[l.invoice_id]) ivuByInvoice[l.invoice_id] = { ivuProducts: 0, ivuLaborFinal: 0, ivuLaborB2B: 0 };
    const tax = Number(l.tax_amount ?? 0);
    if (l.type === 'product') ivuByInvoice[l.invoice_id].ivuProducts += tax;
    else if (l.type === 'labor') {
      if (Number(l.tax_rate ?? 0) <= 0.04) ivuByInvoice[l.invoice_id].ivuLaborB2B += tax;
      else ivuByInvoice[l.invoice_id].ivuLaborFinal += tax;
    }
  });

  const retenidoByClient = {};
  const retenidoByInvoice = {};
  (retenciones ?? []).forEach(r => {
    if (r.client_id) retenidoByClient[r.client_id] = (retenidoByClient[r.client_id] ?? 0) + Number(r.retencion_aplicada ?? 0);
    if (r.invoice_id) retenidoByInvoice[r.invoice_id] = (retenidoByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0);
  });

  const clientTotals = (clients ?? []).map(c => {
    const clientInvoices = invs.filter(i => i.client_id === c.id);
    const facturado = clientInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
    const cobrado = clientInvoices.reduce((a, i) => a + (paymentsByInvoice[i.id] ?? 0), 0);
    const ivuLabor = clientInvoices.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0);
    const ivuProducto = clientInvoices.reduce((a, i) => a + Number(i.tax_products ?? 0), 0);

    // Only paid invoices settle for real, so the expected-net check is scoped to
    // those - unpaid/draft invoices would otherwise look like a false mismatch
    // (billed and retained, but nothing collected yet).
    const paidInvoices = clientInvoices.filter(i => i.status === 'paid');
    const facturadoPagado = paidInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);
    const retenidoPagado = paidInvoices.reduce((a, i) => a + (retenidoByInvoice[i.id] ?? 0), 0);
    const netoEsperado = facturadoPagado - retenidoPagado;
    const varianza = cobrado - netoEsperado;
    const hasVarianza = paidInvoices.length > 0 && Math.abs(varianza) > 0.01;

    return {
      id: c.id,
      name: c.name,
      company: c.company,
      count: clientInvoices.length,
      facturado,
      cobrado,
      ivuLabor,
      ivuProducto,
      retenido: retenidoByClient[c.id] ?? 0,
      netoEsperado,
      varianza,
      hasVarianza,
    };
  }).filter(c => c.count > 0 || c.retenido > 0);

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Cliente 360</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Resumen financiero completo por cliente</p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
        </div>

        <Cliente360Client clientTotals={clientTotals} invoices={invs} ivuByInvoice={ivuByInvoice} />
      </main>
    </div>
  );
}
