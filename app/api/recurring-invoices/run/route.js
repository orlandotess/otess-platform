import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };
const APP_URL = 'https://app.otesspr.com';

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function computeNextRun(current, frequency, dayOfMonth, dayOfWeek) {
  const d = new Date(current + 'T00:00:00');
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }
  const monthsToAdd = frequency === 'quarterly' ? 3 : frequency === 'yearly' ? 12 : 1;
  d.setMonth(d.getMonth() + monthsToAdd);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth || 1, lastDay));
  return d.toISOString().split('T')[0];
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayPR();
  const { data: due, error: dueErr } = await supabase
    .from('recurring_invoices')
    .select('*, clients(name, email, company, client_type), recurring_invoice_items(*)')
    .eq('active', true)
    .lte('next_run_date', today);

  if (dueErr) return Response.json({ error: dueErr.message }, { status: 500 });

  const { data: allInvoices } = await supabase.from('invoices').select('invoice_number');
  let maxNum = 999;
  (allInvoices ?? []).forEach(inv => {
    const match = inv.invoice_number?.match(/^INV-(\d+)$/);
    if (match) {
      const n = parseInt(match[1]);
      if (n > maxNum) maxNum = n;
    }
  });

  const generated = [];
  const failures = [];

  for (const r of due ?? []) {
    try {
      const client = r.clients;
      if (!client?.email) {
        failures.push({ recurringId: r.id, clientName: client?.name ?? 'desconocido', reason: 'El cliente no tiene email registrado' });
        continue;
      }

      const clientType = client.client_type ?? 'final';
      let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
      const lineItems = (r.recurring_invoice_items ?? []).map(it => {
        const base = (it.quantity || 0) * (it.unit_price || 0);
        const rate = it.exempt ? 0 : (TAX[`${clientType}_${it.type}`] ?? 0.115);
        if (it.type === 'product') { subProd += base; taxProd += base * rate; }
        else { subLabor += base; taxLabor += base * rate; }
        return {
          type: it.type, description: it.description, quantity: it.quantity, unit_price: it.unit_price,
          tax_rate: rate, line_total: base, tax_amount: base * rate, sort_order: it.sort_order,
        };
      });
      const total = subProd + taxProd + subLabor + taxLabor;

      maxNum += 1;
      const invoiceNumber = `INV-${maxNum}`;

      const { data: invoice, error: invErr } = await supabase.from('invoices').insert([{
        invoice_number: invoiceNumber,
        client_id: r.client_id,
        notes: r.notes,
        terms: r.terms,
        issued_at: today,
        due_at: addDays(today, r.due_days ?? 15),
        status: 'draft',
        bill_to: r.bill_to,
        subtotal_products: subProd,
        tax_products: taxProd,
        subtotal_labor: subLabor,
        tax_labor: taxLabor,
        total,
      }]).select().single();
      if (invErr) throw new Error(invErr.message);

      await supabase.from('invoice_line_items').insert(lineItems.map(li => ({ ...li, invoice_id: invoice.id })));

      const sendRes = await fetch(`${APP_URL}/api/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, toEmail: client.email }),
      });
      if (!sendRes.ok) {
        const d = await sendRes.json().catch(() => ({}));
        throw new Error(d.error ?? 'Error enviando el email');
      }

      const nextRunDate = computeNextRun(r.next_run_date, r.frequency, r.day_of_month, r.day_of_week);
      await supabase.from('recurring_invoices').update({
        next_run_date: nextRunDate,
        last_sent_at: new Date().toISOString(),
      }).eq('id', r.id);

      generated.push({ recurringId: r.id, clientName: client.name, invoiceNumber, total });
    } catch (err) {
      failures.push({ recurringId: r.id, clientName: r.clients?.name ?? 'desconocido', reason: err.message });
    }
  }

  if (generated.length > 0 || failures.length > 0) {
    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows = [
      ...generated.map(g => `<li style="color:#1a7a4a">✓ ${g.invoiceNumber} — ${g.clientName} — ${fmt(g.total)}</li>`),
      ...failures.map(f => `<li style="color:#b52a2a">✗ ${f.clientName} — ${f.reason}</li>`),
    ].join('');
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `Facturas recurrentes — ${generated.length} enviadas, ${failures.length} con error`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">Resumen del envío automático de facturas recurrentes (${today}):</p><ul style="font-size:13px">${rows}</ul></div>`,
    }).catch(err => console.error('Error notificando resumen de recurrentes:', err));
  }

  return Response.json({ generated, failures });
}
