export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { fallbackLineItems } from '../../../lib/ivu';
import Sidebar from '../../Sidebar';
import InvoiceActions from './InvoiceActions';
import PaymentsTable from './PaymentsTable';

export default async function FacturaDetail({ params }) {
  const { id } = params;

  const [{ data: inv }, { data: items }, { data: payments }, { data: internalAttachments }, { data: invoiceRetenciones }] = await Promise.all([
    supabase.from('invoices').select('*, client_id, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs(id, title, client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    supabase.from('invoice_internal_attachments').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    supabase.from('retenciones').select('id, retencion_aplicada, fecha').eq('invoice_id', id),
  ]);



  if (!inv) return <div style={{ padding: 40 }}>Factura no encontrada</div>;

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const totalRetained = invoiceRetenciones?.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid - totalRetained;

  // Account balance — all pending invoices for this client, net of their own
  // payments and retenciones (so it reflects what the client actually still owes).
  const clientId = inv?.client_id ?? null;
  const { data: clientInvoices } = clientId ? await supabase
    .from('invoices')
    .select('id, total, status')
    .eq('client_id', clientId)
    .in('status', ['sent', 'draft'])
    .neq('id', id) : { data: [] };
  const otherIds = (clientInvoices ?? []).map(i => i.id);
  const [{ data: otherPayments }, { data: otherRetenciones }] = await Promise.all([
    otherIds.length ? supabase.from('payments').select('invoice_id, amount').in('invoice_id', otherIds) : Promise.resolve({ data: [] }),
    otherIds.length ? supabase.from('retenciones').select('invoice_id, retencion_aplicada').in('invoice_id', otherIds) : Promise.resolve({ data: [] }),
  ]);
  const paidByInvoice = {};
  (otherPayments ?? []).forEach(p => { paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] ?? 0) + Number(p.amount ?? 0); });
  const retainedByInvoice = {};
  (otherRetenciones ?? []).forEach(r => { retainedByInvoice[r.invoice_id] = (retainedByInvoice[r.invoice_id] ?? 0) + Number(r.retencion_aplicada ?? 0); });
  const otherBalance = (clientInvoices ?? []).reduce((a, i) => {
    const remaining = Number(i.total ?? 0) - (paidByInvoice[i.id] ?? 0) - (retainedByInvoice[i.id] ?? 0);
    return a + Math.max(remaining, 0);
  }, 0);
  const accountBalance = otherBalance + balance;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const clientProperties = inv.clients?.client_properties ?? [];
  const property = inv.property_id
    ? clientProperties.find(p => p.id === inv.property_id) ?? null
    : inv.jobs?.client_properties ?? null;

  const billToName = inv.bill_to === 'company' && inv.clients?.company
    ? inv.clients.company
    : inv.clients?.name;

  const displayItems = items?.length ? items : fallbackLineItems(inv);
  const isFallbackItems = !items?.length && displayItems.length > 0;
  const statusLabel = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', cancelled: 'Cancelada' };
  const statusCls = { draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', cancelled: 'badge-red' };
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv.status === 'sent' && inv.due_at && inv.due_at < today;

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{inv.invoice_number}</div>
            <span className={`badge ${isOverdue ? 'badge-red' : statusCls[inv.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {isOverdue ? 'Vencida' : statusLabel[inv.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {inv.job_id && (
              <Link href={`/trabajos/${inv.job_id}`} className="btn btn-ghost">
                🔧 Ver trabajo{inv.jobs?.title ? `: ${inv.jobs.title}` : ''}
              </Link>
            )}
            <InvoiceActions
              invoiceId={id}
              status={inv.status}
              balance={balance}
              invoiceNumber={inv.invoice_number}
              clientName={inv.clients?.name}
              clientCompany={inv.clients?.company}
              billTo={inv.bill_to ?? 'person'}
              clientProperties={clientProperties}
              propertyId={inv.property_id ?? null}
              terms={inv.terms ?? ''}
              jobId={inv.job_id ?? null}
              attachedNoteIds={inv.attached_note_ids ?? []}
              internalNotes={inv.internal_notes ?? ''}
              internalAttachments={internalAttachments ?? []}
              clientId={inv.client_id ?? null}
              subtotalLabor={inv.subtotal_labor ?? 0}
              existingRetenciones={invoiceRetenciones ?? []}
              issuedAt={inv.issued_at ?? null}
            />
          </div>
        </div>

        <div className="card" id="invoice-doc" style={{ marginBottom: 20 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: property ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 28 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
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

            {property && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Propiedad del servicio</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{property.name}</div>
                {property.street && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{property.street}</div>}
                {property.city && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{property.city}{property.zip ? `, PR ${property.zip}` : ''}</div>}
              </div>
            )}
          </div>

          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'center', fontSize: 11 }}>Tipo</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Cant.</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Precio</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>IVU</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                    {item.title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{item.title}</div>}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{item.description}</div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span className={`badge ${item.type === 'labor' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                      {item.type === 'labor' ? 'Labor' : 'Producto'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>
                    {item.msrp != null && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: 'line-through' }}>${Number(item.msrp).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    ${Number(item.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    {item.supplier_price != null && (
                      <div style={{ fontSize: 10, color: 'var(--warn)' }}>Costo: ${Number(item.supplier_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    {item.tax_rate === 0 ? 'Exento' : `${(item.tax_rate * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>${(Number(item.line_total) + Number(item.tax_amount)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isFallbackItems && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -14, marginBottom: 24 }}>
              ⚠️ Líneas detalladas no disponibles para esta factura — se muestra un resumen por labor/producto.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 320 }}>
              {[
                { label: 'Subtotal productos', value: inv.subtotal_products },
                { label: 'IVU productos (11.5%)', value: inv.tax_products },
                { label: 'Subtotal labor', value: inv.subtotal_labor },
                { label: `IVU labor (${inv.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: inv.tax_labor },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span>${Number(row.value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>
                <span>TOTAL</span>
                <span>${Number(inv.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              {(totalPaid > 0 || totalRetained > 0) && (
                <>
                  {totalPaid > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: 'var(--ok)' }}>
                      <span>Pagado</span><span>-${totalPaid.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {totalRetained > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: 'var(--amber)' }}>
                      <span>Retención aplicada</span><span>-${totalRetained.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 16, fontWeight: 700, color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                    <span>Balance</span><span>${balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </>
              )}
              {accountBalance > balance && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: 600, color: 'var(--muted)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span>Balance de cuenta</span><span>${accountBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              )}
            </div>
          </div>

          {inv.notes && (
            <div style={{ marginTop: 24, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {inv.notes}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Pagos registrados</h2>
            {balance > 0 && <InvoiceActions invoiceId={id} status={inv.status} showPaymentOnly balance={balance} />}
          </div>
          <PaymentsTable
            payments={payments ?? []}
            invoiceId={id}
            invoiceStatus={inv.status}
            invoiceTotal={inv.total}
            totalRetained={totalRetained}
          />
        </div>

        {inv.terms && (
          <div className="card" style={{ marginTop: 20 }}>
            <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 10, fontSize: 13 }}>Términos del Proyecto</strong>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              {inv.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
