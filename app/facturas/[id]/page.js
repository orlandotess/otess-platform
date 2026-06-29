export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import InvoiceActions from './InvoiceActions';

export default async function FacturaDetail({ params }) {
  const { id } = params;

  const [{ data: inv }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs(id, title, client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
  ]);

  if (!inv) return <div style={{ padding: 40 }}>Factura no encontrada</div>;

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const clientProperties = inv.clients?.client_properties ?? [];
  const property = inv.property_id
    ? clientProperties.find(p => p.id === inv.property_id) ?? null
    : inv.jobs?.client_properties ?? null;

  const billToName = inv.bill_to === 'company' && inv.clients?.company
    ? inv.clients.company
    : inv.clients?.name;

  const statusLabel = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', cancelled: 'Cancelada' };
  const statusCls = { draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', cancelled: 'badge-red' };
  const methodLabel = { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia' };

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page
