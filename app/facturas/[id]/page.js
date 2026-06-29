export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import InvoiceActions from './InvoiceActions';

export default async function FacturaDetail({ params }) {
  const { id } = params;

  const [{ data: inv }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, phone, company, client_type, client_addresses(*)), jobs(id, title, client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
  ]);

  if (!inv) return <div style={{ padding: 40 }}>Factura no encontrada</div>;

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const property = inv.jobs?.client_properties ?? null;

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
        <div className="page-header">
          <div>
            <div className="page-title">{inv.invoice_number}</div>
            <span className={`badge ${statusCls[inv.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {statusLabel[inv.status]}
            </span>
          </div>
          <InvoiceActions invoiceId={id} status={inv.status} invoiceNumber={inv.invoice_number} />
        </div>

        {/* Invoice document */}
        <div className="card" id="invoice-doc" style={{ marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>OT Electrical & Security Solutions</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calle 56, #2D8 Lomas de Carolina</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carolina, PR 00987</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>FACTURA</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{inv.invoice_number}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Fecha: <strong>{inv.issued_at}</strong></div>
              {inv.due_at && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Vence: <strong>{inv.due_at}</strong></div>}
            </div>
          </div>

          {/* Bill to + Property */}
          <div style={{ display: 'grid', gridTemplateColumns: property ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 28 }}>
            {/* Facturar a */}
            <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Facturar a</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
              {inv.bill_to !== 'company' && inv.clients?.company && (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{inv.clients.company}</div>
              )}
              {primaryAddr && (
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  {primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}
                </div>
              )}
              {inv.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.clients.email}</div>}
              {inv.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.clients.phone}</div>}
              {inv.clients?.client_type === 'b2b' && (
                <span className="badge badge-blue" style={{ marginTop: 6, display: 'inline-block' }}>Comerciante Registrado B2B</span>
              )}
            </div>

            {/* Propiedad */}
            {property && (
              <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Propiedad del servicio</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{property.name}</div>
                {property.street && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{property.street}</div>}
                {property.city && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{property.city}{property.zip ? `, PR ${property.zip}` : ''}</div>}
              </div>
            )}
          </div>

          {/* Line items */}
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'center', fontSize: 11 }}>Tipo</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Cant.</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Precio</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>I
