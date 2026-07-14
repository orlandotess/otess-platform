export const dynamic = 'force-dynamic';

import { supabaseServer as supabase } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';
import ReporteActions from './ReporteActions';
import FaseDetalle from './FaseDetalle';

const EDITABLE_ROLES = ['admin', 'secretaria', 'vendedor', 'tecnico'];

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

export default async function ReportePublico({ params }) {
  const { id } = params;

  const [{ data: report }, currentRole] = await Promise.all([
    supabase
      .from('job_reports')
      .select('*, jobs(title, job_number, property_name, street, city, state, zip, clients(name, email, company))')
      .eq('id', id)
      .single(),
    getCurrentRole(),
  ]);
  const canEdit = EDITABLE_ROLES.includes(currentRole);

  if (!report) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>Reporte no encontrado</h2>
        <p style={{ color: '#888' }}>El enlace puede haber expirado o ser incorrecto.</p>
      </div>
    </div>
  );

  let notes = [];
  if (report.note_ids && report.note_ids.length > 0) {
    const { data } = await supabase.from('job_notes').select('*').in('id', report.note_ids);
    notes = await Promise.all((data ?? []).map(async n => {
      const paths = n.photo_urls && n.photo_urls.length > 0 ? n.photo_urls : (n.photo_url ? [n.photo_url] : []);
      const signedUrls = await Promise.all(paths.map(async p => {
        const { data: sd } = await supabase.storage.from('Job-photos').createSignedUrl(p, 86400);
        return sd?.signedUrl ?? null;
      }));
      return { ...n, signedUrls: signedUrls.filter(Boolean) };
    }));
  }

  const sortedNotes = [...notes].sort((a, b) => (a.phase_number ?? Infinity) - (b.phase_number ?? Infinity) || new Date(a.created_at) - new Date(b.created_at));

  const phaseGroups = {};
  sortedNotes.filter(n => n.title || n.note).forEach(n => {
    const key = n.phase_number != null ? `Fase ${n.phase_number}` : 'General';
    if (!phaseGroups[key]) phaseGroups[key] = [];
    phaseGroups[key].push(n);
  });

  const photos = sortedNotes.flatMap(n => n.signedUrls.map(url => ({
    url,
    caption: n.title || (n.note ? n.note.slice(0, 80) : null),
  })));

  const client = report.jobs?.clients;
  const property = report.jobs;
  const hasProperty = property && (property.property_name || property.street || property.city);
  const fmtDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

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
                <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>REPORTE DE STATUS</div>
                {report.jobs?.job_number && <div style={{ color: '#999', fontSize: 15, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>{report.jobs.job_number}</div>}
              </div>
            </div>

            <div style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em' }}>Reporte</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#16223d' }}>{report.title}</div>
                {report.jobs?.title && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{report.jobs.title}</div>}
              </div>

              {(report.visit_date || report.personnel) && (
                <div style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.8 }}>
                  {report.visit_date && <div>Fecha de visita: <strong style={{ color: '#16223d' }}>{fmtDate(report.visit_date)}</strong></div>}
                  {report.personnel && <div>Personal presente: <strong style={{ color: '#16223d' }}>{report.personnel}</strong></div>}
                </div>
              )}

              {client && (() => {
                const asCompany = report.name_source === 'company' && client.company;
                const primary = asCompany ? client.company : client.name;
                const secondary = asCompany ? client.name : client.company;
                return (
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Cliente</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{primary}</div>
                    {secondary && <div style={{ color: '#999', fontSize: 13 }}>{secondary}</div>}
                  </div>
                );
              })()}

              {hasProperty && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Propiedad</div>
                  {property.property_name && <div style={{ fontWeight: 700, fontSize: 15 }}>{property.property_name}</div>}
                  {property.street && <div style={{ color: '#999', fontSize: 13 }}>{property.street}</div>}
                  {(property.city || property.state || property.zip) && (
                    <div style={{ color: '#999', fontSize: 13 }}>
                      {property.city}{property.state ? `, ${property.state}` : ''}{property.zip ? ` ${property.zip}` : ''}
                    </div>
                  )}
                </div>
              )}

              {report.summary && (
                <Section title="Resumen de Actividades">
                  {lines(report.summary).map((p, i) => (
                    <p key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 10px' }}>{p}</p>
                  ))}
                </Section>
              )}

              {Object.keys(phaseGroups).length > 0 && (
                <Section title="Detalle por Fase">
                  <FaseDetalle
                    phaseGroups={Object.fromEntries(Object.entries(phaseGroups).map(([label, notesInGroup]) => [
                      label,
                      notesInGroup.map(n => ({ id: n.id, title: n.title ?? null, note: n.note ?? null, phase_number: n.phase_number ?? null })),
                    ]))}
                    canEdit={canEdit}
                  />
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

              {photos.length > 0 && (
                <Section title="Evidencia Fotográfica">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {photos.map((p, idx) => {
                      const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(p.url);
                      const isPdf = /\.pdf(\?|$)/i.test(p.url);
                      return (
                        <div key={idx}>
                          {isPdf ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, background: '#fafafa', borderRadius: 8, textDecoration: 'none', border: '1px solid #eee' }}>
                              <span style={{ fontSize: 32 }}>📄</span>
                              <span style={{ fontSize: 12, color: '#999', fontWeight: 600, marginTop: 6 }}>Ver PDF</span>
                            </a>
                          ) : isVideo ? (
                            <video src={p.url} controls style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                          ) : (
                            <a href={p.url} target="_blank" rel="noopener noreferrer">
                              <img src={p.url} alt={p.caption || 'Foto del trabajo'} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                            </a>
                          )}
                          {p.caption && <div style={{ fontSize: 12.5, color: '#888', marginTop: 6, textAlign: 'center' }}>{p.caption}</div>}
                        </div>
                      );
                    })}
                  </div>
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
