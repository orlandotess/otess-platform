export const dynamic = 'force-dynamic';

import { supabaseServer as supabase } from '../../../lib/supabase';

export default async function EstimaPublica({ params }) {
  const { id } = params;

  const { data: est } = await supabase
    .from('estimates')
    .select('*, clients(name, email, phone, company, client_type, client_addresses(*), client_properties(*))')
    .eq('id', id)
    .single();

  if (!est) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>Estimado no encontrado</h2>
        <p style={{ color: '#888' }}>El enlace puede haber expirado o ser incorrecto.</p>
      </div>
    </div>
  );

  const { data: items } = await supabase.from('estimate_line_items').select('*').eq('estimate_id', id).order('sort_order');

  const primaryAddr = est.clients?.client_addresses?.find(a => a.is_primary) ?? est.clients?.client_addresses?.[0];
  const billToName = est.bill_to === 'company' && est.clients?.company ? est.clients.company : est.clients?.name;
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', padding: '32px 16px', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #eee', marginBottom: 20 }}>

          <div style={{ padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee' }}>
            <div>
              <img src="/otess-logo.png" alt="OTESS" style={{ width: 130, height: 'auto', display: 'block' }} />
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>OT Electrical & Security Solutions</div>
              <div style={{ color: '#999', fontSize: 12 }}>Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
              <div style={{ color: '#999', fontSize: 12 }}>(787) 513-8352 · info@otesspr.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>ESTIMADO</div>
              <div style={{ color: '#999', fontSize: 15, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>{est.estimate_number}</div>
              <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>Fecha: <strong style={{ color: '#555' }}>{est.issued_at}</strong></div>
              {est.valid_until && <div style={{ color: '#999', fontSize: 12 }}>Válida hasta: <strong style={{ color: '#555' }}>{est.valid_until}</strong></div>}
            </div>
          </div>

          <div style={{ padding: '28px 32px' }}>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Preparado para</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{billToName}</div>
              {est.bill_to !== 'company' && est.clients?.company && <div style={{ color: '#999', fontSize: 13 }}>{est.clients.company}</div>}
              {primaryAddr && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{primaryAddr.line1}, {primaryAddr.city} {primaryAddr.zip}</div>}
              {est.clients?.email && <div style={{ color: '#999', fontSize: 13 }}>{est.clients.email}</div>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 12px 8px 0', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>Descripción</th>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 12px', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>Tipo</th>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>Cant.</th>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>Precio</th>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>IVU</th>
                  <th style={{ color: '#aaa', fontWeight: 600, padding: '8px 0 8px 12px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items?.map(item => (
                  <tr key={item.id}>
                    <td style={{ padding: '12px 12px 12px 0', fontWeight: 500, fontSize: 14, borderBottom: '1px solid #f4f4f4' }}>{item.description}</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #f4f4f4' }}>
                      <span style={{ color: item.type === 'labor' ? '#92600a' : '#666', fontSize: 11.5, fontWeight: 600 }}>
                        {item.type === 'labor' ? 'Labor' : 'Producto'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#999', fontSize: 14, borderBottom: '1px solid #f4f4f4' }}>{item.quantity}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#999', fontSize: 14, borderBottom: '1px solid #f4f4f4' }}>{fmt(item.unit_price)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#999', fontSize: 12, borderBottom: '1px solid #f4f4f4' }}>{item.tax_rate === 0 ? 'Exento' : `${(item.tax_rate * 100).toFixed(1)}%`}</td>
                    <td style={{ padding: '12px 0 12px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, borderBottom: '1px solid #f4f4f4' }}>{fmt(Number(item.line_total) + Number(item.tax_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: 300 }}>
                {[
                  { label: 'Subtotal productos', value: est.subtotal_products },
                  { label: 'IVU productos (11.5%)', value: est.tax_products },
                  { label: 'Subtotal labor', value: est.subtotal_labor },
                  { label: `IVU labor (${est.clients?.client_type === 'b2b' ? '4%' : '11.5%'})`, value: est.tax_labor },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f4f4f4' }}>
                    <span style={{ color: '#999' }}>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, fontWeight: 700, color: '#16223d', borderTop: '1px solid #eee', marginTop: 4 }}>
                  <span>TOTAL</span>
                  <span>{fmt(est.total)}</span>
                </div>
              </div>
            </div>

            {est.notes && (
              <div style={{ marginTop: 24, padding: '14px 18px', background: '#fafafa', borderRadius: 8, fontSize: 13, color: '#999', border: '1px solid #f0f0f0' }}>
                <strong style={{ color: '#16223d' }}>Notas:</strong> {est.notes}
              </div>
            )}

            {est.terms && (
              <div style={{ marginTop: 16, padding: '14px 18px', background: '#fafafa', borderRadius: 8, fontSize: 12, color: '#999', lineHeight: 1.7, border: '1px solid #f0f0f0' }}>
                <strong style={{ color: '#16223d', display: 'block', marginBottom: 8, fontSize: 13 }}>Términos del Proyecto</strong>
                {est.terms.split('\n').map((line, i) => line.trim() ? <p key={i} style={{ margin: '0 0 8px' }}>{line}</p> : null)}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '16px 0' }}>
          <p>¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style={{ color: '#e0972c' }}>info@otesspr.com</a> o al (787) 513-8352</p>
        </div>
      </div>
    </div>
  );
}
