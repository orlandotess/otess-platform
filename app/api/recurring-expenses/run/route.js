import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
    .from('recurring_expenses')
    .select('*')
    .eq('active', true)
    .lte('next_run_date', today);

  if (dueErr) return Response.json({ error: dueErr.message }, { status: 500 });

  const generated = [];
  const failures = [];

  for (const r of due ?? []) {
    try {
      const { error: expErr } = await supabase.from('expenses').insert([{
        job_id: null,
        category: r.category,
        description: r.description,
        vendor: r.vendor,
        amount: r.amount,
        expense_date: today,
      }]);
      if (expErr) throw new Error(expErr.message);

      const nextRunDate = computeNextRun(r.next_run_date, r.frequency, r.day_of_month, r.day_of_week);
      await supabase.from('recurring_expenses').update({
        next_run_date: nextRunDate,
        last_run_at: new Date().toISOString(),
      }).eq('id', r.id);

      generated.push({ description: r.description, amount: r.amount });
    } catch (err) {
      failures.push({ description: r.description, reason: err.message });
    }
  }

  if (generated.length > 0 || failures.length > 0) {
    const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows = [
      ...generated.map(g => `<li style="color:#1a7a4a">✓ ${g.description} — ${fmt(g.amount)}</li>`),
      ...failures.map(f => `<li style="color:#b52a2a">✗ ${f.description} — ${f.reason}</li>`),
    ].join('');
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `Gastos recurrentes — ${generated.length} registrados, ${failures.length} con error`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">Resumen del registro automático de gastos recurrentes (${today}):</p><ul style="font-size:13px">${rows}</ul></div>`,
    }).catch(err => console.error('Error notificando resumen de gastos recurrentes:', err));
  }

  return Response.json({ generated, failures });
}
