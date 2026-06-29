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
        <div className="page-header">
          <div>
            <div className="page-title">{inv.invoice_number}</div>
            <span className={`badge ${statusCls[inv.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {statusLabel[inv.status]}
            </span>
          </div>
          <InvoiceActions
            invoiceId={id}
            status={inv.status}
            invoiceNumber={inv.invoice_number}
            clientName={inv.clients?.name}
            clientCompany={inv.clients?.company}
            billTo={inv.bill_to ?? 'person'}
            clientProperties={clientProperties}
            propertyId={inv.property_id ?? null}
          />
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

            {property && (
              <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px 20px' }}>
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
              {items?.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{item.description}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span className={`badge ${item.type === 'labor' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                      {item.type === 'labor' ? 'Labor' : 'Producto'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>${Number(item.unit_price).toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    {item.tax_rate === 0 ? 'Exento' : `${(item.tax_rate * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>${(Number(item.line_total) + Number(item.tax_amount)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
                  <span>${Number(row.value).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>
                <span>TOTAL</span>
                <span>${Number(inv.total).toFixed(2)}</span>
              </div>
              {totalPaid > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: 'var(--ok)' }}>
                    <span>Pagado</span><span>-${totalPaid.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 16, fontWeight: 700, color: balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                    <span>Balance</span><span>${balance.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {inv.notes && (
            <div style={{ marginTop: 24, padding: '14px 18px', background: '#f8f9fb', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {inv.notes}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Pagos registrados</h2>
            {balance > 0 && <InvoiceActions invoiceId={id} status={inv.status} showPaymentOnly balance={balance} />}
          </div>
          {!payments?.length ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No hay pagos registrados aún.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{p.paid_at}</td>
                    <td><span className="badge badge-green">{methodLabel[p.method]}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.reference ?? '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ok)' }}>${Number(p.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
