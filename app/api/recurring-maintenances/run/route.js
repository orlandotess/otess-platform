export const dynamic = 'force-dynamic';

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
    .from('recurring_maintenances')
    .select('*, clients(name), recurring_maintenance_technicians(technician_id), recurring_maintenance_items(text, sort_order)')
    .eq('active', true)
    .lte('next_run_date', today);

  if (dueErr) return Response.json({ error: dueErr.message }, { status: 500 });

  const generated = [];
  const failures = [];

  for (const r of due ?? []) {
    try {
      const technicianIds = [r.technician_id, ...(r.recurring_maintenance_technicians ?? []).map(t => t.technician_id)].filter(Boolean);

      const { data: task, error: taskErr } = await supabase.from('tasks').insert([{
        task_type: 'checklist',
        title: r.title,
        notes: r.notes,
        address: r.address,
        due_at: new Date(`${today}T${r.time_of_day || '09:00'}:00`).toISOString(),
        technician_id: technicianIds[0] ?? null,
        client_id: r.client_id,
      }]).select().single();
      if (taskErr) throw new Error(taskErr.message);

      if (technicianIds.length > 1) {
        const { error: techErr } = await supabase.from('task_technicians').insert(
          technicianIds.slice(1).map(technician_id => ({ task_id: task.id, technician_id }))
        );
        if (techErr) throw new Error(techErr.message);
      }

      const items = (r.recurring_maintenance_items ?? []).sort((a, b) => a.sort_order - b.sort_order);
      if (items.length) {
        const { error: itemsErr } = await supabase.from('task_items').insert(
          items.map((it, i) => ({ task_id: task.id, text: it.text, sort_order: i }))
        );
        if (itemsErr) throw new Error(itemsErr.message);
      }

      const nextRunDate = computeNextRun(r.next_run_date, r.frequency, r.day_of_month, r.day_of_week);
      await supabase.from('recurring_maintenances').update({
        next_run_date: nextRunDate,
        last_run_at: new Date().toISOString(),
      }).eq('id', r.id);

      generated.push({ title: r.title, client: r.clients?.name });
    } catch (err) {
      failures.push({ title: r.title, reason: err.message });
    }
  }

  if (generated.length > 0 || failures.length > 0) {
    const rows = [
      ...generated.map(g => `<li style="color:#1a7a4a">✓ ${g.title}${g.client ? ` — ${g.client}` : ''}</li>`),
      ...failures.map(f => `<li style="color:#b52a2a">✗ ${f.title} — ${f.reason}</li>`),
    ].join('');
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: `Mantenimientos recurrentes — ${generated.length} generados, ${failures.length} con error`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p style="font-size:15px;color:#16223d">Resumen de visitas de mantenimiento generadas automáticamente (${today}):</p><ul style="font-size:13px">${rows}</ul></div>`,
    }).catch(err => console.error('Error notificando resumen de mantenimientos recurrentes:', err));
  }

  return Response.json({ generated, failures });
}
