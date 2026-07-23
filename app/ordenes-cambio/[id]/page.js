export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import { formatDateTimePR } from '../../../lib/datetimeLocal';
import Sidebar from '../../Sidebar';
import ChangeOrderActions from './ChangeOrderActions';

const STATUS_LABEL = { borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const STATUS_CLS = { borrador: 'badge-gray', enviada: 'badge-blue', vista: 'badge-amber', aprobada: 'badge-green', rechazada: 'badge-red' };

export default async function OrdenCambioDetail({ params }) {
  const { id } = params;

  const { data: order } = await supabase
    .from('change_orders')
    .select('*, clients(name, email, phone, company, client_type), jobs(id, title)')
    .eq('id', id)
    .single();

  if (!order) return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content"><div style={{ padding: 40 }}>Orden de cambio no encontrada</div></main>
    </div>
  );

  const { data: items } = await supabase.from('change_order_line_items').select('*').eq('change_order_id', id).order('sort_order');

  const { data: clientContacts } = order.client_id
    ? await supabase.from('client_contacts').select('id, name, email').eq('client_id', order.client_id)
    : { data: [] };

  const itemsWithSignedUrls = await Promise.all(
    (items ?? []).map(async it => {
      if (!it.photo_url) return it;
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(it.photo_url, 3600);
      return { ...it, photo_signed_url: data?.signedUrl ?? null };
    })
  );

  const billToName = order.bill_to === 'company' && order.clients?.company ? order.clients.company : order.clients?.name;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="page-title">{order.change_order_number}</div>
              <span className={`badge ${STATUS_CLS[order.status]}`}>{STATUS_LABEL[order.status]}</span>
            </div>
            {order.jobs && (
              <Link href={`/trabajos/${order.jobs.id}`} style={{ fontSize: 13, color: 'var(--muted)' }}>← {order.jobs.title}</Link>
            )}
          </div>
          <ChangeOrderActions
            orderId={id}
            status={order.status}
            clientEmail={order.clients?.email}
            clientName={order.clients?.name}
            orderNumber={order.change_order_number}
            publicToken={order.public_token}
            clientContacts={clientContacts ?? []}
          />
        </div>

        <div className="card" id="change-order-doc" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>OTESS</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>OT Electrical & Security Solutions</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calle 56, #2D8 Lomas de Carolina</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carolina, PR 00987</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', letterSpacing: -1 }}>ORDEN DE CAMBIO</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>{order.change_order_number}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Fecha: <strong>{order.issued_at}</strong></div>
              {order.valid_until && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Válida hasta: <strong>{order.valid_until}</strong></div>}
            </div>
          </div>

          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Preparado para</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
            {order.bill_to !== 'company' && order.clients?.company && <div style={{ color: 'var(--muted)', fontSize: 14 }}>{order.clients.company}</div>}
            {order.clients?.email && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{order.clients.email}</div>}
            {order.clients?.phone && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{order.clients.phone}</div>}
          </div>

          {order.title && <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{order.title}</div>}
          {order.intro_note && <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>{order.intro_note}</p>}

          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'center', fontSize: 11 }}>Tipo</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Cant.</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Precio</th>
                <th style={{ color: '#fff', padding: '10px 14px', textAlign: 'right', fontSize: 11 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {itemsWithSignedUrls.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                    {item.description}
                    {item.area && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>📍 {item.area}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span className={`badge ${item.type === 'labor' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>{item.type === 'labor' ? 'Labor' : 'Producto'}</span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--muted)' }}>${Number(item.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>${(Number(item.line_total) + Number(item.tax_amount)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 320 }}>
              {[
                { label: 'Subtotal productos', value: order.subtotal_products },
                { label: 'IVU productos (11.5%)', value: order.tax_products },
                { label: 'Subtotal labor', value: order.subtotal_labor },
                { label: `IVU labor (${order.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: order.tax_labor },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span>${Number(row.value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>
                <span>TOTAL</span>
                <span>${Number(order.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {order.status === 'aprobada' && (
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--ok-tint)', borderRadius: 10, fontSize: 13, color: 'var(--ok)' }}>
              Aprobada el {formatDateTimePR(order.approved_at)}
              {order.signed_name && <div style={{ marginTop: 4 }}>Firmada por <strong>{order.signed_name}</strong></div>}
            </div>
          )}

          {order.terms && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--navy)', display: 'block', marginBottom: 8, fontSize: 13 }}>Términos</strong>
              {order.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
