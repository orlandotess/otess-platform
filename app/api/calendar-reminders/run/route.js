import { getResend } from '../../../../lib/resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { resolveTechEmail } from '../../../../lib/technicianEmail';
import { getServerLocale, getEmailTranslator } from '../../../../lib/i18n-server';

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

function digestEmail(dateLabel, items, t) {
  const rows = items.length
    ? items.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')
    : `<li style="color:#999">${t('noEvents')}</li>`;
  return `<div style="font-family:Arial,sans-serif;padding:20px;max-width:560px">
    <p style="font-size:15px;color:#16223d;font-weight:700">${t('digestTitle', { date: dateLabel })}</p>
    <ul style="font-size:14px;color:#333;padding-left:18px">${rows}</ul>
    <p style="font-size:12px;color:#999;margin-top:20px"><a href="${APP_URL}/calendario" style="color:#e0972c">${t('viewFullCalendar')}</a></p>
  </div>`;
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?dry=1 arma el digest completo pero no envía ni un correo, para poder verificar
  // qué saldría sin llenarle el buzón al equipo. El cron nunca lo pasa.
  const params = new URL(request.url).searchParams;
  const dry = params.get('dry') === '1';
  // Override de fecha (YYYY-MM-DD) solo para pruebas: sin él no hay forma de ver el
  // digest de un día con eventos. Solo se acepta junto a dry=1, así que no puede
  // usarse para dispararle al equipo el correo de otro día.
  const dateParam = params.get('date');
  const today = dry && /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam : null;

  try {
    return await runDigest({ dry, today });
  } catch (err) {
    console.error('calendar-reminders/run crashed:', err);
    if (dry) return Response.json({ dry: true, error: err?.message ?? String(err) }, { status: 500 });
    const locale = getServerLocale();
    const t = await getEmailTranslator(locale, 'emails.calendarReminder');
    const { error: sendError } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: t('errorSubject'),
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><p>${t('errorBody')}</p><pre style="white-space:pre-wrap;font-size:12px;color:#b52a2a">${(err?.stack ?? String(err)).replace(/</g, '&lt;')}</pre></div>`,
    }).catch(err => ({ error: err }));
    if (sendError) console.error('Error enviando notificación de fallo:', sendError.message);
    return Response.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

async function runDigest({ dry = false, today: todayOverride = null } = {}) {
  const locale = getServerLocale();
  const t = await getEmailTranslator(locale, 'emails.calendarReminder');
  const today = todayOverride ?? todayPR();
  const { start, end } = dayBoundsPR(today);
  const dateLabel = new Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${today}T12:00:00-04:00`));

  const [{ data: jobs }, { data: jobScheduleDays }, { data: visits }, { data: calendarEvents }, { data: tasks }, { data: technicians }, { data: profiles }] = await Promise.all([
    supabase.from('jobs')
      .select('id, title, status, scheduled_start, technician_id, street, city, property_name, clients(name), job_technicians(technician_id)')
      .gte('scheduled_start', start).lt('scheduled_start', end),
    // Extra visits added via "+ Añadir día" — a job whose only visit today
    // lives here (not on jobs.scheduled_start) would otherwise never appear
    // in anyone's digest.
    supabase.from('job_schedule_days')
      .select('id, scheduled_start, technician_id, jobs(title, property_name, street, city, clients(name))')
      .gte('scheduled_start', start).lt('scheduled_start', end),
    // Evaluaciones en sitio de solicitudes — reemplazan la tabla `visits` del
    // módulo Requests original, que nunca llegó a crearse.
    supabase.from('solicitudes')
      .select('id, title, assessment_date, technician_id, clients(name), solicitud_technicians(technician_id)')
      .not('assessment_date', 'is', null).neq('status', 'archivada')
      .gte('assessment_date', start).lt('assessment_date', end),
    supabase.from('calendar_events')
      .select('id, title, address, property_name, start_at, technician_id, clients(name), calendar_event_technicians(technician_id)')
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
    const location = j.property_name || [j.street, j.city].filter(Boolean).join(', ');
    const item = { time: j.scheduled_start, title: j.title, subtitle: [j.clients?.name, location].filter(Boolean).join(' — ') };
    distribute(item, techIdsFor(j.technician_id, j.job_technicians));
  }
  for (const d of jobScheduleDays ?? []) {
    if (!d.jobs) continue;
    const location = d.jobs.property_name || [d.jobs.street, d.jobs.city].filter(Boolean).join(', ');
    const item = { time: d.scheduled_start, title: d.jobs.title, subtitle: [d.jobs.clients?.name, location].filter(Boolean).join(' — ') };
    distribute(item, techIdsFor(d.technician_id, []));
  }
  for (const v of visits ?? []) {
    const item = { time: v.assessment_date, title: v.title ?? t('defaultVisitTitle'), subtitle: v.clients?.name };
    distribute(item, techIdsFor(v.technician_id, v.solicitud_technicians));
  }
  for (const e of calendarEvents ?? []) {
    const item = { time: e.start_at, title: e.title, subtitle: [e.clients?.name, e.property_name || e.address].filter(Boolean).join(' — ') };
    distribute(item, techIdsFor(e.technician_id, e.calendar_event_technicians));
  }
  for (const task of tasks ?? []) {
    const label = task.task_type === 'checklist' ? t('taskChecklist') : t('taskReminder');
    const item = { time: task.due_at, title: `${label}: ${task.title}`, subtitle: task.clients?.name };
    distribute(item, techIdsFor(task.technician_id, []));
  }

  const sent = [];
  const unresolved = [];
  const failed = [];

  for (const [techId, items] of byTech) {
    const tech = (technicians ?? []).find(t => t.id === techId);
    if (!tech) continue;
    const email = resolveTechEmail(tech, profiles ?? []);
    if (!email) { unresolved.push({ name: tech.name, count: items.length }); continue; }
    if (!dry) {
      const { error: sendError } = await getResend().emails.send({
        from: 'OTESS <info@otesspr.com>',
        to: email,
        subject: t('digestTitle', { date: dateLabel }),
        html: digestEmail(dateLabel, items, t),
      }).catch(err => ({ error: err }));
      if (sendError) {
        console.error(`Error enviando agenda a ${tech.name}:`, sendError.message);
        failed.push({ name: tech.name, count: items.length, reason: sendError.message });
        continue;
      }
    }
    sent.push({ name: tech.name, count: items.length });
  }

  const adminSections = [];
  for (const [techId, items] of byTech) {
    const tech = (technicians ?? []).find(t2 => t2.id === techId);
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px">${tech?.name ?? t('unknownTechnician')}</p><ul style="font-size:13px;padding-left:18px">${items.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')}</ul>`);
  }
  if (unassigned.length) {
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px;color:#b52a2a">${t('unassigned')}</p><ul style="font-size:13px;padding-left:18px">${unassigned.sort((a, b) => new Date(a.time) - new Date(b.time)).map(itemLine).join('')}</ul>`);
  }
  if (unresolved.length) {
    adminSections.push(`<p style="font-weight:700;margin-bottom:4px;color:#b52a2a">${t('emailNotSent')}</p><ul style="font-size:13px;padding-left:18px">${unresolved.map(u => `<li>${t('noLinkedEmail', { name: u.name, count: u.count })}</li>`).join('')}</ul>`);
  }

  const adminHtml = `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px">${adminSections.join('') || `<p style="color:#999">${t('noEventsToday')}</p>`}</div>`;
  if (!dry) {
    const { error: sendError } = await getResend().emails.send({
      from: 'OTESS <info@otesspr.com>',
      to: 'services@otesspr.com',
      subject: t('adminSummarySubject', { date: dateLabel }),
      html: adminHtml,
    }).catch(err => ({ error: err }));
    if (sendError) console.error('Error enviando resumen de admin:', sendError.message);
  }

  return Response.json({ sent, unresolved, failed, unassignedCount: unassigned.length, ...(dry ? { dry: true, adminHtml } : {}) });
}
