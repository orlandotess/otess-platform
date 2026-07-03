export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function FacturaPublica({ params }) {
  const { id } = params;

  const [{ data: inv }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*))').eq('id', id).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
  ]);

  // Trackear vista + notificar por email
  if (inv) {
    await supabase.from('invoice_views').insert([{ invoice_id: id }]);

    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `👁️ Factura ${inv.invoice_number} fue abierta`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <p style="font-size:15px;color:#16223d"><strong>${inv.clients?.name ?? 'Un cliente'}</strong> abrió la factura <strong>${inv.invoice_number}</strong>.</p>
          <p style="font-size:13px;color:#888">Fecha: ${new Date().toLocaleString('es-PR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <a href="https://app.otesspr.com/facturas/${id}" style="color:#e0972c;font-size:13px">Ver factura en el dashboard →</a>
        </div>
      `,
    }).catch(err => console.error('Error notificando vista:', err));
  }

  // Fetch attached job notes (photos/videos/PDFs selected by admin)
  let attachedNotes = [];
  if (inv?.attached_note_ids && inv.attached_note_ids.length > 0) {
    const { data: notes } = await supabase.from('job_notes').select('*').in('id', inv.attached_note_ids);
    attachedNotes = await Promise.all((notes ?? []).map(async n => {
      const paths = n.photo_urls && n.photo_urls.length > 0 ? n.photo_urls : (n.photo_url ? [n.photo_url] : []);
      const signedUrls = await Promise.all(paths.map(async p => {
        const { data: sd } = await supabase.storage.from('Job-photos').createSignedUrl(p, 86400);
        return sd?.signedUrl ?? null;
      }));
      return { ...n, signedUrls: signedUrls.filter(Boolean) };
    }));
  }

  if (!inv) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>Factura no encontrada</h2>
        <p style={{ color: '#888' }}>El enlace puede haber expirado o ser incorrecto.</p>
      </div>
    </div>
  );

  const totalPaid = payments?.reduce((a, p) => a + Number(p.amount), 0) ?? 0;
  const balance = Number(inv.total) - totalPaid;
  const primaryAddr = inv.clients?.client_addresses?.find(a => a.is_primary) ?? inv.clients?.client_addresses?.[0];
  const billToName = inv.bill_to === 'company' && inv.clients?.company ? inv.clients.company : inv.clients?.name;
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusLabel = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', cancelled: 'Cancelada' };
  const statusColor = { draft: '#888', sent: '#2a4cb5', paid: '#27ae60', cancelled: '#e74c3c' };

  return (
    <div style={{ background: '#f4f5f7', minHeight: '100vh', padding: '32px 16px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>


        {/* Invoice card */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 20 }}>

          {/* Header */}
          <div style={{ background: '#16223d', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <img src="/otess-logo.png" alt="OTESS" style={{ width: 150, height: 'auto', display: 'block' }} />
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>OT Electrical & Security Solutions</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 900 }}>FACTURA</div>
              <div style={{ color: '#e0972c', fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8 }}>Fecha: <strong style={{ color: '#fff' }}>{inv.issued_at}</strong></div>
              {inv.due_at && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Vence: <strong style={{ color: '#fff' }}>{inv.due_at}</strong></div>}
            </div>
          </div>

          <div style={{ padding: '28px 32px' }}>
            {/* Bill to */}
            <div style={{ background: '#f8f9fb', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.1em' }}>Facturar a</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{billToName}</div>
              {inv.bill_to !== 'company' && inv.clients?.company && <div style={{ color: '#888', fontSize: 14 }}>{inv.clients.company}</div>}
              {primaryAddr && <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}</div>}
              {inv.clients?.email && <div style={{ color: '#888', fontSize: 13 }}>{inv.clients.email}</div>}
            </div>

            {/* Line items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: '#16223d' }}>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'center', fontSize: 11 }}>Tipo</th>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'right', fontSize: 11 }}>Cant.</th>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'right', fontSize: 11 }}>Precio</th>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'right', fontSize: 11 }}>IVU</th>
                  <th style={{ color: '#fff', padding: '10px 12px', textAlign: 'right', fontSize: 11 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items?.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', fontWeight: 500, fontSize: 14 }}>{item.description}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: item.type === 'labor' ? '#fff3cd' : '#f0f0f0', color: item.type === 'labor' ? '#856404' : '#555', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        {item.type === 'labor' ? 'Labor' : 'Producto'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#888', fontSize: 14 }}>{item.quantity}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#888', fontSize: 14 }}>{fmt(item.unit_price)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#888', fontSize: 12 }}>{item.tax_rate === 0 ? 'Exento' : `${(item.tax_rate * 100).toFixed(1)}%`}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{fmt(Number(item.line_total) + Number(item.tax_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 300 }}>
                {[
                  { label: 'Subtotal productos', value: inv.subtotal_products },
                  { label: 'IVU productos (11.5%)', value: inv.tax_products },
                  { label: 'Subtotal labor', value: inv.subtotal_labor },
                  { label: `IVU labor (${inv.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: inv.tax_labor },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #eee' }}>
                    <span style={{ color: '#888' }}>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 20, fontWeight: 900, color: '#16223d' }}>
                  <span>TOTAL</span>
                  <span>{fmt(inv.total)}</span>
                </div>
                {totalPaid > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#27ae60' }}>
                      <span>Pagado</span><span>-{fmt(totalPaid)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 16, fontWeight: 700, color: balance > 0 ? '#e0972c' : '#27ae60' }}>
                      <span>Balance</span><span>{fmt(balance)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {inv.notes && (
              <div style={{ marginTop: 24, padding: '14px 18px', background: '#f8f9fb', borderRadius: 10, fontSize: 13, color: '#888' }}>
                <strong style={{ color: '#16223d' }}>Notas:</strong> {inv.notes}
              </div>
            )}

            {inv.terms && (
              <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8f9fb', borderRadius: 10, fontSize: 12, color: '#888', lineHeight: 1.7 }}>
                <strong style={{ color: '#16223d', display: 'block', marginBottom: 8, fontSize: 13 }}>Términos del Proyecto</strong>
                {inv.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
              </div>
            )}
          </div>
        </div>

        {attachedNotes.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', padding: '28px 32px', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16223d', marginBottom: 18 }}>📎 Fotos y documentos del trabajo</div>
            {attachedNotes.map(n => (
              <div key={n.id} style={{ marginBottom: 20 }}>
                {n.signedUrls.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: n.signedUrls.length === 1 ? '1fr' : n.signedUrls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: n.note ? 10 : 0 }}>
                    {n.signedUrls.map((url, idx) => {
                      const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                      const isPdf = /\.pdf(\?|$)/i.test(url);
                      if (isPdf) return (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, background: '#f8f9fb', borderRadius: 10, textDecoration: 'none', border: '1.5px solid #eee' }}>
                          <span style={{ fontSize: 36 }}>📄</span>
                          <span style={{ fontSize: 12, color: '#888', fontWeight: 600, marginTop: 6 }}>Ver PDF</span>
                        </a>
                      );
                      if (isVideo) return (
                        <video key={idx} src={url} controls style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10, background: '#000' }} />
                      );
                      return (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="Foto del trabajo" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10 }} />
                        </a>
                      );
                    })}
                  </div>
                )}
                {n.note && <p style={{ fontSize: 14, color: '#555', margin: 0 }}>{n.note}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, padding: '16px 0' }}>
          <p>¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style={{ color: '#e0972c' }}>info@otesspr.com</a> o al (787) 513-8352</p>
        </div>
      </div>
    </div>
  );
}
