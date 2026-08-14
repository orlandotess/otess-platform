export const dynamic = 'force-dynamic';

import { supabaseServer as supabase } from '../../../lib/supabase';
import ReporteActions from './ReporteActions';
import { getTranslations, getLocale } from 'next-intl/server';

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

export default async function ReporteBoletoPublico({ params }) {
  const { id } = params;
  const t = await getTranslations('reportes.boleto');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  const { data: report } = await supabase
    .from('ticket_reports')
    .select('*, service_tickets(subject, clients(name, email, company))')
    .eq('id', id)
    .single();

  if (!report) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ color: '#16223d' }}>{t('notFoundTitle')}</h2>
        <p style={{ color: '#888' }}>{t('notFoundBody')}</p>
      </div>
    </div>
  );

  const ticket = report.service_tickets;
  const client = ticket?.clients;
  const fmtDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div style={{ background: '#fafafa', minHeight: '100vh', padding: '32px 16px', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
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
                <div style={{ color: '#16223d', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em' }}>{t('title')}</div>
              </div>
            </div>

            <div style={{ padding: '28px 32px' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em' }}>{t('reportLabel')}</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: '#16223d' }}>{report.title}</div>
                {ticket?.subject && <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>{ticket.subject}</div>}
              </div>

              {(report.resolution_date || report.personnel) && (
                <div style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.8 }}>
                  {report.resolution_date && <div>{t('resolutionDateLabel')} <strong style={{ color: '#16223d' }}>{fmtDate(report.resolution_date)}</strong></div>}
                  {report.personnel && <div>{t('personnelLabel')} <strong style={{ color: '#16223d' }}>{report.personnel}</strong></div>}
                </div>
              )}

              {client && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '16px 20px', marginBottom: 20, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em' }}>{t('clientLabel')}</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{client.name}</div>
                  {client.company && <div style={{ color: '#999', fontSize: 13 }}>{client.company}</div>}
                </div>
              )}

              {report.summary && (
                <Section title={t('summaryTitle')}>
                  {lines(report.summary).map((p, i) => (
                    <p key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 10px' }}>{p}</p>
                  ))}
                </Section>
              )}

              {report.observations && (
                <Section title={t('observationsTitle')}>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {lines(report.observations).map((o, i) => (
                      <li key={i} style={{ fontSize: 14, color: '#444', lineHeight: 1.7, marginBottom: 6 }}>{o}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {report.recommendations && (
                <Section title={t('recommendationsTitle')}>
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
          <p>{t('footer.questions')} <a href="mailto:info@otesspr.com" style={{ color: '#e0972c' }}>info@otesspr.com</a> {t('footer.orCall', { phone: '(787) 513-8352' })}</p>
        </div>
      </div>
    </div>
  );
}
