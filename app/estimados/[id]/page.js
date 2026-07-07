export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import EstimateActions from './EstimateActions';

export default async function EstimaDetail({ params }) {
  const { id } = params;

  const { data: est } = await supabase
    .from('estimates')
    .select('*, client_id, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*)), jobs(id, title, client_properties(*))')
    .eq('id', id)
    .single();

  if (!est) return <div style={{ padding: 40 }}>Estimado no encontrado</div>;

  const { data: items } = await supabase.from('estimate_line_items').select('*').eq('estimate_id', id).order('sort_order');

  const primaryAddr = est.clients?.client_addresses?.find(a => a.is_primary) ?? est.clients?.client_addresses?.[0];
  const clientProperties = est.clients?.client_properties ?? [];
  const property = est.property_id
    ? clientProperties.find(p => p.id === est.property_id) ?? null
    : est.jobs?.client_properties ?? null;

  const billToName = est.bill_to === 'company' && est.clients?.company
    ? est.clients.company
    : est.clients?.name;

  const statusLabel = { draft: 'Borrador', sent: 'Enviado', cancelled: 'Cancelado' };
  const statusCls = { draft: 'badge-gray', sent: 'badge-blue', cancelled: 'badge-red' };

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{est.estimate_number}</div>
            <span className={`badge ${statusCls[est.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {statusLabel[est.status]}
            </span>
          </div>
          <EstimateActions
            estimateId={id}
            status={est.status}
            clientEmail={est.clients?.email}
            estimateNumber={est.estimate_number}
            clientName={est.clients?.name}
            clientCompany={est.clients?.company}
            billTo={est.bill_to ?? 'person'}
            clientProperties={clientProperties}
            propertyId={est.property_id ?? null}
            terms={est.terms ?? ''}
          />
        </div>

        <div className="card" id="estimate-doc" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>OT Electrical & Security Solutions</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calle 56, #2D8 Lomas de Carolina</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carolina, PR 00987</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>ESTIMADO</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{est.estimate_number}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Fecha: <strong>{est.issued_at}</strong></div>
              {est.valid_until && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Válida hasta: <strong>{est.valid_until}</strong></div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: property ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 28 }}>
            <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Preparado para</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
              {est.bill_to !== 'company' && est.clients?.company && (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{est.clients.company}</div>
              )}
              {primaryAddr && (
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  {primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}
                </div>
              )}
              {est.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{est.clients.email}</div>}
              {est.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{est.clients.phone}</div>}
              {est.clients?.client_type === 'b2b' && (
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
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>
                    {item.msrp != null && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: 'line-through' }}>${Number(item.msrp).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    ${Number(item.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    {item.supplier_price != null && (
                      <div style={{ fontSize: 10, color: '#c0392b' }}>Costo: ${Number(item.supplier_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 320 }}>
              {[
                { label: 'Subtotal productos', value: est.subtotal_products },
                { label: 'IVU productos (11.5%)', value: est.tax_products },
                { label: 'Subtotal labor', value: est.subtotal_labor },
                { label: `IVU labor (${est.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: est.tax_labor },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span>${Number(row.value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>
                <span>TOTAL</span>
                <span>${Number(est.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {est.notes && (
            <div style={{ marginTop: 24, padding: '14px 18px', background: '#f8f9fb', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--navy)' }}>Notas:</strong> {est.notes}
            </div>
          )}

          {est.terms && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8f9fb', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 8, fontSize: 13 }}>Términos del Proyecto</strong>
              {est.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
