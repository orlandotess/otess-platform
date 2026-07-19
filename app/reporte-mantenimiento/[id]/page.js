export const dynamic = 'force-dynamic';

import { supabaseServer as supabase } from '../../../lib/supabase';
import ReporteActions from './ReporteActions';

function lines(text) {
  return (text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28, paddingTop: 20, borderTop: '1px solid #eee' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#16223d', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export default async function ReporteMantenimientoPublico({ params }) {
  const { id } = params;

  const { data: report } = await supabase
    .from('maintenance_reports')
    .select('*, tasks(title, address, due_at, client_id, technician_id, clients(name, email, company), technicians(name), task_technicians(technicians(name)), task_items(id, text, done, sort_order, attachments), task_notes(id, note, author_name, photo_urls, created_at))')
    .eq('id', id)
    .single();

  if (!report) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>Reporte no encontrado</h2>
        <p style={{ color: '#888' }}>El enlace puede haber expirado o ser incorrecto.</p>
      </div>
    </div>
  );

  const task = report.tasks;
  const client = task?.clients;

  const checklist = [...(task?.task_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const checklistWithUrls = await Promise.all(checklist.map(async item => {
    const paths = item.attachments ?? [];
    const urls = await Promise.all(paths.map(async p => {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 86400);
      return data?.signedUrl ?? null;
    }));
    return { ...item, photoUrls: urls.filter(Boolean) };
  }));

  const notes = [...(task?.task_notes ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const notesWithUrls = await Promise.all(notes.map(async n => {
    const paths = n.photo_urls ?? [];
    const urls = await Promise.all(paths.map(async p => {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(p, 86400);
      return data?.signedUrl ?? null;
    }));
    return { ...n, photoUrls: urls.filter(Boolean) };
  }));

  const technicianNames = [task?.technicians?.name, ...(task?.task_technicians ?? []).map(t => t.technicians?.name)].filter(Boolean).join(', ');
  const fmtDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const fmtDateTime = d => d ? new Date(d).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const doneCount = checklist.filter(i => i.done).length;

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', padding: '32px 16px', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <ReporteActions filename={`${report.title}.pdf`} />
        </div>

        <div id="report-doc">
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #eee', marginBottom: 20 }}>

            <div style={{ padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee' }}>
              <div>
                <img src="/otess-logo.png" alt="OTESS" style={{ width: 130, height: 'auto', display: 'block' }} />
                <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>OT Electrical & Security Solutions</div>
                <div style={{ color: '#999', fontSize: 12 }}>Calle 56, #2D8 Lomas de Carolina, PR 00987</div>
                <div style={{ color: '#999', fontSize: 12 }}>(787) 513-8352 · info@otesspr.com</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>REPORTE DE MANTENIMIENTO</div>
              </div>
            </div>

            <div style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em' }}>Reporte</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#16223d' }}>{report.title}</div>
                {task?.title && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{task.title}</div>}
              </div>

              {(report.visit_date || technicianNames) && (
                <div style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.8 }}>
                  {report.visit_date && <div>Fecha de visita: <strong style={{ color: '#16223d' }}>{fmtDate(report.visit_date)}</strong></div>}
                  {(report.personnel || technicianNames) && <div>Personal presente: <strong style={{ color: '#16223d' }}>{report.personnel || technicianNames}</strong></div>}
                </div>
              )}

              {client && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Cliente</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{client.name}</div>
                  {client.company && <div style={{ color: '#999', fontSize: 13 }}>{client.company}</div>}
                </div>
              )}

              {task?.address && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Dirección</div>
                  <div style={{ color: '#444', fontSize: 13 }}>{task.address}</div>
                </div>
              )}

              {report.summary && (
                <Section title="Resumen de la Visita">
                  {lines(report.summary).map((p, i) => (
                    <p key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 10px' }}>{p}</p>
                  ))}
                </Section>
              )}

              {checklistWithUrls.length > 0 && (
                <Section title={`Checklist (${doneCount}/${checklistWithUrls.length} completados)`}>
                  <div style={{ display: 'grid', gap: 14 }}>
                    {checklistWithUrls.map(item => (
                      <div key={item.id}>
                        <div style={{ fontSize: 14, color: '#333', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ flexShrink: 0 }}>{item.done ? '✅' : '⬜'}</span>
                          <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#888' : '#333' }}>{item.text}</span>
                        </div>
                        {item.photoUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 24 }}>
                            {item.photoUrls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={item.text} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {notesWithUrls.length > 0 && (
                <Section title="Notas de la Visita">
                  <div style={{ display: 'grid', gap: 14 }}>
                    {notesWithUrls.map(n => (
                      <div key={n.id}>
                        {n.note && <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 6px' }}>{n.note}</p>}
                        {n.photoUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            {n.photoUrls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="Foto de la visita" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                              </a>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: '#999' }}>{n.author_name ?? 'Técnico'} · {fmtDateTime(n.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {report.observations && (
                <Section title="Observaciones">
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {lines(report.observations).map((o, i) => (
                      <li key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 6 }}>{o}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {report.recommendations && (
                <Section title="Recomendaciones">
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {lines(report.recommendations).map((r, i) => (
                      <li key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 6 }}>{r}</li>
                    ))}
                  </ol>
                </Section>
              )}

              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #eee' }}>
                {report.prepared_by && <div style={{ fontWeight: 700, fontSize: 14, color: '#16223d' }}>{report.prepared_by}</div>}
                <div style={{ color: '#999', fontSize: 13 }}>OTESS · OT Electrical & Security Solutions</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '16px 0' }}>
          <p>¿Preguntas? Contáctanos en <a href="mailto:info@otesspr.com" style={{ color: '#e0972c' }}>info@otesspr.com</a> o al (787) 513-8352</p>
        </div>
      </div>
    </div>
  );
}
