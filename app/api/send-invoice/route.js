import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn'
);

export async function POST(request) {
  const { invoiceId, toEmail } = await request.json();
  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, company, client_type)').eq('id', invoiceId).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
  ]);
  if (!inv) return Response.json({ error: 'No encontrada' }, { status: 404 });
  const rows = items?.map(i =>
cat > app/api/send-invoice/route.js << 'ROUTEEOF'
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  'https://zisidorwdhrttmdppnbj.supabase.co',
  'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn'
);

export async function POST(request) {
  const { invoiceId, toEmail } = await request.json();
  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, company, client_type)').eq('id', invoiceId).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
  ]);
  if (!inv) return Response.json({ error: 'No encontrada' }, { status: 404 });
  const rows = items?.map(i => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${i.description}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.type==='labor'?'Labor':'Producto'}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${Number(i.unit_price).toFixed(2)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">$${(Number(i.line_total)+Number(i.tax_amount)).toFixed(2)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f5f7;padding:40px 20px"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#16223d;padding:24px 32px;display:flex;justify-content:space-between"><div><div style="color:#fff;font-size:22px;font-weight:900">OTESS</div><div style="color:rgba(255,255,255,0.6);font-size:12px">OT Electrical & Security Solutions</div></div><div style="text-align:right"><div style="color:#e0972c;font-size:18px;font-weight:900;font-family:monospace">${inv.invoice_number}</div><div style="color:rgba(255,255,255,0.6);font-size:12px">Fecha: ${inv.issued_at}</div></div></div><div style="padding:24px 32px"><div style="background:#f8f9fb;border-radius:8px;padding:14px 18px;margin-bottom:20px"><div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px">Facturar a</div><div style="font-weight:700;font-size:15px">${inv.clients?.name}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:#16223d"><th style="color:#fff;padding:8px 12px;text-align:left;font-size:11px">Descripción</th><th style="color:#fff;padding:8px 12px;text-align:center;font-size:11px">Tipo</th><th style="color:#fff;padding:8px 12px;text-align:right;font-size:11px">Cant.</th><th style="color:#fff;padding:8px 12px;text-align:right;font-size:11px">Precio</th><th style="color:#fff;padding:8px 12px;text-align:right;font-size:11px">Total</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:right"><div style="display:inline-block;width:260px"><div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">Subtotal productos</span><span>$${Number(inv.subtotal_products).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">IVU productos (11.5%)</span><span>$${Number(inv.tax_products).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">Subtotal labor</span><span>$${Number(inv.subtotal_labor).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#888">IVU labor</span><span>$${Number(inv.tax_labor).toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;padding:10px 0;font-size:18px;font-weight:900;color:#16223d"><span>TOTAL</span><span>$${Number(inv.total).toFixed(2)}</span></div></div></div><div style="margin-top:20px;font-size:11px;color:#aaa;text-align:center">OTESS · (787) 513-8352 · info@otesspr.com</div></div></div></body></html>`;
  const { error } = await resend.emails.send({ from: 'OTESS <onboarding@resend.dev>', to: toEmail, subject: `Factura ${inv.invoice_number} — OTESS`, html });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);
  return Response.json({ success: true });
}
