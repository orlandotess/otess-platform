import { Resend } from 'resend';
import { supabaseServer as supabase } from '../../../../lib/supabase';
import { getCurrentRole } from '../../../../lib/supabase-server';
import { resolveTechEmail } from '../../../../lib/technicianEmail';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = 'https://app.otesspr.com';

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export async function POST(request) {
  const role = await getCurrentRole();
  if (!role) return Response.json({ error: 'No autorizado' }, { status: 403 });

  const { jobId, technicianId } = await request.json();
  if (!jobId || !technicianId) return Response.json({ error: 'jobId y technicianId son requeridos' }, { status: 400 });

  const [{ data: job }, { data: tech }, { data: profiles }, { data: scheduleDays }] = await Promise.all([
    supabase.from('jobs').select('id, title, description, scheduled_start, scheduled_end, street, city, state, zip, clients(name)').eq('id', jobId).single(),
    supabase.from('technicians').select('id, name, profile_id').eq('id', technicianId).single(),
    supabase.from('profiles').select('id, name, email'),
    // A job can have more than one visit (job_schedule_days, added via "+
    // Añadir día") beyond its own scheduled_start/end — list every visit
    // instead of only the primary one, or the technician only learns about
    // the first date and misses the rest.
    supabase.from('job_schedule_days').select('scheduled_start, scheduled_end').eq('job_id', jobId).order('scheduled_start'),
  ]);

  if (!job || !tech) return Response.json({ sent: false, reason: 'Trabajo o técnico no encontrado' }, { status: 404 });

  const email = resolveTechEmail(tech, profiles ?? []);
  if (!email) {
    console.error(`No se pudo notificar asignación a ${tech.name}: sin email vinculado`);
    return Response.json({ sent: false, reason: 'El técnico no tiene un email vinculado' });
  }

  const visits = [];
  if (job.scheduled_start) visits.push({ start: job.scheduled_start, end: job.scheduled_end });
  (scheduleDays ?? []).forEach(d => { if (d.scheduled_start) visits.push({ start: d.scheduled_start, end: d.scheduled_end }); });
  visits.sort((a, b) => new Date(a.start) - new Date(b.start));

  const scheduleLine = visits.length > 1
    ? `<li>Visitas programadas:<ul style="margin:4px 0 0 0">${visits.map(v => `<li>${fmtDateTime(v.start)}</li>`).join('')}</ul></li>`
    : visits.length === 1 ? `<li>Programado: ${fmtDateTime(visits[0].start)}</li>` : '';

  const address = [job.street, job.city, job.state, job.zip].filter(Boolean).join(', ');
  const html = `<div style="font-family:Arial,sans-serif;padding:20px;max-width:560px">
    <p style="font-size:15px;color:#16223d;font-weight:700">Se te asignó un trabajo</p>
    <p style="font-size:14px;color:#333"><strong>${job.title}</strong></p>
    <ul style="font-size:14px;color:#333;padding-left:18px">
      ${job.clients?.name ? `<li>Cliente: ${job.clients.name}</li>` : ''}
      ${address ? `<li>Dirección: ${address}</li>` : ''}
      ${scheduleLine}
      ${job.description ? `<li>Descripción: ${job.description}</li>` : ''}
    </ul>
    <p style="font-size:12px;color:#999;margin-top:20px"><a href="${APP_URL}/trabajos/${job.id}" style="color:#e0972c">Ver trabajo →</a></p>
  </div>`;

  const { error } = await resend.emails.send({
    from: 'OTESS <info@otesspr.com>',
    to: email,
    subject: `Trabajo asignado: ${job.title}`,
    html,
  });

  if (error) {
    console.error(`Error enviando aviso de asignación a ${tech.name}:`, error);
    return Response.json({ sent: false, reason: error.message });
  }

  return Response.json({ sent: true });
}
