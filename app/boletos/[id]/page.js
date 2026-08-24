export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import TicketActions from './TicketActions';
import TechnicianAssign from './TechnicianAssign';
import TicketReports from './TicketReports';
import { formatDuration } from '../../../lib/formatDuration';
import { formatDateTimePR } from '../../../lib/datetimeLocal';
import { getTranslations, getLocale } from 'next-intl/server';

export default async function BoletoDetailPage(props) {
  const params = await props.params;
  const { id } = params;
  const t = await getTranslations('boletos.detail');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  const statusLabel = { abierto: t('status.open'), en_progreso: t('status.inProgress'), cerrado: t('status.closed') };
  const statusCls = { abierto: 'badge-red', en_progreso: 'badge-blue', cerrado: 'badge-gray' };

  const [{ data: ticket }, { data: technicians }] = await Promise.all([
    supabase.from('service_tickets')
      .select('*, clients(id, name, company, email, phone), client_properties(name, street, city), technicians(id, name)')
      .eq('id', id)
      .single(),
    supabase.from('technicians').select('id, name').order('name'),
  ]);

  if (!ticket) return <div style={{ padding: 40 }}>{t('notFound')}</div>;

  const [{ data: reports }, { data: clientContacts }] = await Promise.all([
    supabase.from('ticket_reports').select('*').eq('ticket_id', id).order('created_at', { ascending: false }),
    ticket.client_id
      ? supabase.from('client_contacts').select('id, name, email').eq('client_id', ticket.client_id)
      : Promise.resolve({ data: [] }),
  ]);

  const elapsed = ticket.status === 'cerrado'
    ? formatDuration(ticket.created_at, ticket.resolved_at ?? ticket.updated_at)
    : formatDuration(ticket.created_at, new Date().toISOString());

  return (
    <div className="admin-shell ds-boletos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">{ticket.subject}</div>
            <span className={`badge ${statusCls[ticket.status]}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {statusLabel[ticket.status]}
            </span>
            {elapsed && (
              <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--muted)' }}>
                {ticket.status === 'cerrado' ? t('resolvedIn', { elapsed }) : t('elapsedTime', { elapsed })}
              </span>
            )}
          </div>
          <TicketActions ticketId={id} status={ticket.status} clientId={ticket.client_id} />
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>{t('details')}</h2>
          {ticket.description ? (
            <p style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ticket.description}</p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('noDetails')}</p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{t('client')}</h2>
              {ticket.ticket_number && (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace', background: 'var(--amber-tint)', padding: '3px 8px', borderRadius: 8 }}>
                  {ticket.ticket_number}
                </span>
              )}
            </div>
            {ticket.clients ? (
              <>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  <Link href={`/clientes/${ticket.clients.id}`} style={{ color: 'var(--navy)' }}>{ticket.clients.company || ticket.clients.name} →</Link>
                </p>
                {ticket.client_properties && (
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                    📍 {ticket.client_properties.name}{ticket.client_properties.street ? ` — ${ticket.client_properties.street}` : ''}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--warn)' }}>⚠️ {t('noClientMatch')}</p>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>{t('reportedBy')}</h2>
            {ticket.contact_name || ticket.contact_email || ticket.contact_phone ? (
              <>
                {ticket.contact_name && <p style={{ fontSize: 14, marginBottom: 4 }}>{ticket.contact_name}</p>}
                {ticket.contact_email && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{ticket.contact_email}</p>}
                {ticket.contact_phone && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{ticket.contact_phone}</p>}
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('noContact')}</p>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              {ticket.source === 'email' ? t('receivedByEmail') : t('openedByTeam')} · {formatDateTimePR(ticket.created_at, { dateStyle: 'medium', timeStyle: 'short' }, dateLocale)}
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>{t('assignedTechnician')}</h2>
            <TechnicianAssign ticketId={id} technicians={technicians ?? []} technicianId={ticket.technician_id} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <TicketReports ticketId={id} clientContacts={clientContacts ?? []} reports={reports ?? []} />
        </div>
      </main>
    </div>
  );
}
