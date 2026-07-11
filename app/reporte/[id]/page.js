export const dynamic = 'force-dynamic';

import { supabaseServer as supabase } from '../../../lib/supabase';
import ReporteActions from './ReporteActions';

export default async function ReportePublico({ params }) {
  const { id } = params;

  const { data: report } = await supabase
    .from('job_reports')
    .select('*, jobs(title, job_number, clients(name, email, company))')
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

  const groups = {};
  [...notes]
    .sort((a, b) => (a.phase_number ?? Infinity) - (b.phase_number ?? Infinity) || new Date(a.created_at) - new Date(b.created_at))
    .forEach(n => {
      const key = n.phase_number != null ? `Fase ${n.phase_number}` : 'General';
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });

  const client = report.jobs?.clients;

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
                <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>REPORTE DE TRABAJO</div>
                {report.jobs?.job_number && <div style={{ color: '#999', fontSize: 15, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>{report.jobs.job_number}</div>}
                <div style={{ color: '#999', fontSize: 12, marginTop: 8 }} suppressHydrationWarning>
                  Fecha: <strong style={{ color: '#555' }}>{new Date(report.created_at).toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em' }}>Reporte</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#16223d' }}>{report.title}</div>
                {report.jobs?.title && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{report.jobs.title}</div>}
              </div>

              {client && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>Cliente</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{client.name}</div>
                  {client.company && <div style={{ color: '#999', fontSize: 13 }}>{client.company}</div>}
                </div>
              )}

              {Object.keys(groups).length === 0 ? (
                <p style={{ color: '#999', fontSize: 14 }}>Este reporte no tiene notas seleccionadas.</p>
              ) : Object.entries(groups).map(([label, notesInGroup]) => (
                <div key={label} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#16223d', display: 'inline-block', padding: '4px 12px', borderRadius: 20, marginBottom: 14 }}>{label}</div>
                  {notesInGroup.map(n => (
                    <div key={n.id} style={{ marginBottom: 20 }}>
                      {n.title && <div style={{ fontWeight: 700, fontSize: 14.5, color: '#16223d', marginBottom: 6 }}>{n.title}</div>}
                      {n.signedUrls.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: n.signedUrls.length === 1 ? '1fr' : n.signedUrls.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: n.note ? 10 : 0 }}>
                          {n.signedUrls.map((url, idx) => {
                            const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                            const isPdf = /\.pdf(\?|$)/i.test(url);
                            if (isPdf) return (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, background: '#fafafa', borderRadius: 8, textDecoration: 'none', border: '1px solid #eee' }}>
                                <span style={{ fontSize: 32 }}>📄</span>
                                <span style={{ fontSize: 12, color: '#999', fontWeight: 600, marginTop: 6 }}>Ver PDF</span>
                              </a>
                            );
                            if (isVideo) return (
                              <video key={idx} src={url} controls style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
                            );
                            return (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={n.title || 'Foto del trabajo'} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8 }} />
                              </a>
                            );
                          })}
                        </div>
                      )}
                      {n.note && <p style={{ fontSize: 14, color: '#666', margin: 0 }}>{n.note}</p>}
                    </div>
                  ))}
                </div>
              ))}
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
