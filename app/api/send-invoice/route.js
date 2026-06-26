import { Resend } from 'resend';
import { supabase } from '../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  const { invoiceId, toEmail } = await request.json();

  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from('invoices').select('*, clients(name, email, company)').eq('id', invoiceId).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
  ]);

  if (!inv) return Response.json({ error: 'Factura no encontrada' }, { status: 404 });

  const itemsHTML = items?.map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee">${i.description}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${i.type === 'labor' ? 'Labor' : 'Producto'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">$${Number(i.unit_price).toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${i.tax_rate === 0 ? 'Exento' : (Number(i.tax_rate)*100).toFixed(1)+'%'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">$${(Number(i.line_total)+Number(i.tax_amount)).toFixed(2)}</td>
    </tr>
  `).join('') ?? '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f5f7;margin:0;padding:40px 20px">
  <div style="max-width:650px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:#16223d;padding:28px 32px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-1px">OTESS</div>
        <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:2px">OT Electrical & Security Solutions</div>
      </div>
      <div style="text-align:right">
        <div style="color:#e0972c;font-size:20px;font-weight:900;font-family:monospace">${inv.invoice_number}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px">Fecha: ${inv.issued_at}</div>
        ${inv.due_at ? `<div style="color:rgba(255,255,255,0.6);font-size:12px">Vence: ${inv.due_at}</div>` : ''}
      </div>
    </div>

    <div style="padding:28px 32px">
      <div style="background:#f8f9fb;border-radius:10px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:#888;margin-bottom:8px;text-transform:uppercase">Facturar a</div>
        <div style="font-weight:700;font-size:16px">${inv.clients?.name}</div>
        ${inv.clients?.company ? `<div style="color:#666;font-size:14px">${inv.clients.company}</div>` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#16223d">
            <th style="color:#fff;padding:10px 12px;text-align:left;font-size:11px">Descripción</th>
            <th style="color:#fff;padding:10px 12px;text-align:center;font-size:11px">Tipo</th>
            <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">Cant.</th>
            <th style="color:#fff;padding:10px 12px;text-align:right;font-size:11px">Pr
git add .
git commit -m "Add email invoice feature"
git push
