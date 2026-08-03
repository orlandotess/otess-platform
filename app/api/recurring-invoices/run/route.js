import { Resend } from 'resend';
import { withRetry } from '../../../../lib/withRetry';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { calcularIVU, tasaParaLinea } from '../../../../lib/tax';

const resend = new Resend(process.env.RESEND_API_KEY);

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
    .select('*, clients(name, email, client_type), recurring_invoice_items(*)')
    .eq('active', true)
    .lte('next_run_date', today);

  if (dueErr) return Response.json({ error: dueErr.message }, { status: 500 });

  const { data: taxRules } = await supabase.from('tax_rules').select('client_type, line_item_type, rate');
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
      const ivu = calcularIVU(r.recurring_invoice_items ?? [], clientType, taxRules);
      const lineItems = (r.recurring_invoice_items ?? []).map(it => {
        const base = (it.quantity || 0) * (it.unit_price || 0);
        const rate = tasaParaLinea(it, clientType, taxRules);
        return {
          type: it.type, tax_category: it.tax_category || it.type, description: it.description, quantity: it.quantity, unit_price: it.unit_price,
          tax_rate: rate, line_total: base, tax_amount: base * rate, sort_order: it.sort_order,
        };
      });
      // invoices no tiene columna propia para "reembolso" — se pliega en
      // subtotal_products (tasa 0%, no afecta tax_products). Misma nota que
      // en app/facturas/InvoiceForm.js.
      const productCat = ivu.categorias.find(c => c.codigo === 'product');
      const laborCat = ivu.categorias.find(c => c.codigo === 'labor');
      const reembolsoCat = ivu.categorias.find(c => c.codigo === 'reembolso');
      const subProd = productCat.base + reembolsoCat.base;
      const taxProd = productCat.impuesto + reembolsoCat.impuesto;
      const subLabor = laborCat.base;
      const taxLabor = laborCat.impuesto;
      const total = ivu.total;

      maxNum += 1;
      const invoiceNumber = `INV-${maxNum}`;

      const { data: invoice, error: invErr } = await supabase.from('invoices').insert([{
        invoice_number: invoiceNumber,
        client_id: r.client_id,
        recurring_invoice_id: r.id,
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

      const { error: liErr } = await supabase.from('invoice_line_items').insert(lineItems.map(li => ({ ...li, invoice_id: invoice.id })));
      if (liErr) {
        failures.push({ recurringId: r.id, clientName: client.name, reason: `${invoiceNumber} se creó pero sus líneas no se guardaron (${liErr.message}) — ábrela y agrégalas manualmente` });
      }

      // The invoice now exists either way — advance the schedule so we never generate a duplicate
      // for this cycle, even if the email send below ends up failing.
      const nextRunDate = computeNextRun(r.next_run_date, r.frequency, r.day_of_month, r.day_of_week);
      await supabase.from('recurring_invoices').update({
        next_run_date: nextRunDate,
        last_sent_at: new Date().toISOString(),
      }).eq('id', r.id);

      try {
        await withRetry(async () => {
          const sendRes = await fetch(`${APP_URL}/api/send-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({ invoiceId: invoice.id, toEmail: client.email }),
          });
          if (!sendRes.ok) {
            const d = await sendRes.json().catch(() => ({}));
            throw new Error(d.error ?? 'Error enviando el email');
          }
        });
        generated.push({ recurringId: r.id, clientName: client.name, invoiceNumber, total });
      } catch (sendErr) {
        failures.push({ recurringId: r.id, clientName: client.name, reason: `${invoiceNumber} se creó pero no se pudo enviar (${sendErr.message}) — envíala manualmente desde Facturas` });
      }
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
