import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { resolveTechEmail } from '../../../../lib/technicianEmail';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = 'https://app.otesspr.com';

function todayPR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Puerto Rico doesn't observe DST, so -04:00 is a stable offset year-round.
function dayBoundsPR(today) {
  const start = `${today}T00:00:00-04:00`;
  const next = new Date(new Date(`${today}T00:00:00-04:00`).getTime() + 86400000);
  const end = next.toISOString().slice(0, 10) + 'T00:00:00-04:00';
  return { start, end };
}

function fmtTime(iso) {
  return new Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function itemLine(item) {
  const parts = [`<strong>${fmtTime(item.time)}</strong> — ${item.title}`];
  if (item.subtitle) parts.push(item.subtitle);
  return `<li style="margin-bottom:6px">${parts.join(' — ')}</li>`;
}

function digestEmail(dateLabel, items) {
  const rows = items.length
    ? items.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')
    : '<li style="color:#999">Sin eventos programados.</li>';
  return `<div style="font-family:Arial,sans-serif;padding:20px;max-width:560px">
    <p style="font-size:15px;color:#16223d;font-weight:700">Tu agenda de hoy — ${dateLabel}</p>
    <ul style="font-size:14px;color:#333;padding-left:18px">${rows}</ul>
    <p style="font-size:12px;color:#999;margin-top:20px"><a href="${APP_URL}/calendario" style="color:#e0972c">Ver calendario completo →</a></p>
  </div>`;
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayPR();
  const { start, end } = dayBoundsPR(today);
  const dateLabel = new Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${today}T12:00:00-04:00`));

  const [{ data: jobs }, { data: visits }, { data: calendarEvents }, { data: tasks }, { data: technicians }, { data: profiles }] = await Promise.all([
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, technician_id, street, city, clients(name), job_technicians(technician_id)')
      .gte('scheduled_start', start).lt('scheduled_start', end),
    supabase.from('visits')
      .select('id, technician_id, scheduled_at, requests(title, clients(name))')
      .gte('scheduled_at', start).lt('scheduled_at', end),
    supabase.from('calendar_events')
      .select('id, title, address, start_at, technician_id, clients(name), calendar_event_technicians(technician_id)')
      .gte('start_at', start).lt('start_at', end),
    supabase.from('tasks')
      .select('id, task_type, title, due_at, technician_id, clients(name)')
      .gte('due_at', start).lt('due_at', end),
    supabase.from('technicians').select('id, name, profile_id'),
    supabase.from('profiles').select('id, name, email'),
  ]);

  const byTech = new Map(); // technician_id -> items[]
  const unassigned = [];

  const techIdsFor = (primaryId, joinRows) => {
    const ids = new Set();
    if (primaryId) ids.add(primaryId);
    for (const jt of joinRows ?? []) if (jt.technician_id) ids.add(jt.technician_id);
    return ids;
  };

  const distribute = (item, techIds) => {
    if (techIds.size === 0) { unassigned.push(item); return; }
    for (const id of techIds) {
      if (!byTech.has(id)) byTech.set(id, []);
      byTech.get(id).push(item);
    }
  };

  for (const j of jobs ?? []) {
    const item = { time: j.scheduled_start, title: j.title, subtitle: [j.clients?.name, [j.street, j.city].filter(Boolean).join(', ')].filter(Boolean).join(' — ') };
    distribute(item, techIdsFor(j.technician_id, j.job_technicians));
  }
  for (const v of visits ?? []) {
    const item = { time: v.scheduled_at, title: v.requests?.title ?? 'Visita', subtitle: v.requests?.clients?.name };
    distribute(item, techIdsFor(v.technician_id, []));
  }
  for (const e of calendarEvents ?? []) {
    const item = { time: e.start_at, title: e.title, subtitle: [e.clients?.name, e.address].filter(Boolean).join(' — ') };
    distribute(item, techIdsFor(e.technician_id, e.calendar_event_technicians));
  }
  for (const t of tasks ?? []) {
    const label = t.task_type === 'checklist' ? 'Checklist' : 'Recordatorio';
    const item = { time: t.due_at, title: `${label}: ${t.title}`, subtitle: t.clients?.name };
    distribute(item, techIdsFor(t.technician_id, []));
  }

  const sent = [];
  const unresolved = [];

  for (const [techId, items] of byTech) {
    const tech = (technicians ?? []).find(t => t.id === techId);
    if (!tech) continue;
    const email = resolveTechEmail(tech, profiles ?? []);
    if (!email) { unresolved.push({ name: tech.name, count: items.length }); continue; }
    await resend.emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: email,
      subject: `Tu agenda de hoy — ${dateLabel}`,
      html: digestEmail(dateLabel, items),
    }).catch(err => console.error(`Error enviando agenda a ${tech.name}:`, err));
    sent.push({ name: tech.name, count: items.length });
  }

  const adminSections = [];
  for (const [techId, items] of byTech) {
    const tech = (technicians ?? []).find(t => t.id === techId);
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px">${tech?.name ?? 'Técnico desconocido'}</p><ul style="font-size:13px;padding-left:18px">${items.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')}</ul>`);
  }
  if (unassigned.length) {
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px;color:#b52a2a">Sin asignar</p><ul style="font-size:13px;padding-left:18px">${unassigned.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')}</ul>`);
  }
  if (unresolved.length) {
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px;color:#b52a2a">No se pudo enviar correo a</p><ul style="font-size:13px;padding-left:18px">${unresolved.map(u => `<li>${u.name} (${u.count} evento${u.count === 1 ? '' : 's'}) — sin email vinculado</li>`).join('')}</ul>`);
  }

  await resend.emails.send({
    from: 'OTESS <info@otesspr.com>',
    to: 'services@otesspr.com',
    subject: `Resumen del calendario — ${dateLabel}`,
    html: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px">${adminSections.join('') || '<p style="color:#999">Sin eventos programados hoy.</p>'}</div>`,
  }).catch(err => console.error('Error enviando resumen de admin:', err));

  return Response.json({ sent, unresolved, unassignedCount: unassigned.length });
}
