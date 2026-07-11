export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import TicketActions from './TicketActions';
import TechnicianAssign from './TechnicianAssign';

const statusLabel = { abierto: 'Abierto', en_progreso: 'En progreso', cerrado: 'Cerrado' };
const statusCls = { abierto: 'badge-red', en_progreso: 'badge-blue', cerrado: 'badge-gray' };

export default async function BoletoDetailPage({ params }) {
  const { id } = params;

  const [{ data: ticket }, { data: technicians }] = await Promise.all([
    supabase.from('service_tickets')
      .select('*, clients(id, name, company, email, phone), client_properties(name, street, city), technicians(id, name)')
      .eq('id', id)
      .single(),
    supabase.from('technicians').select('id, name').order('name'),
  ]);

  if (!ticket) return <div style={{ padding: 40 }}>Boleto no encontrado</div>;

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
          </div>
          <TicketActions ticketId={id} status={ticket.status} clientId={ticket.client_id} />
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Detalles</h2>
          {ticket.description ? (
            <p style={{ fontSize: 14, color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ticket.description}</p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>Sin detalles adicionales.</p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Cliente</h2>
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
              <p style={{ fontSize: 14, color: 'var(--warn)' }}>⚠️ No se encontró un cliente con este correo. Asígnalo abajo.</p>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Reportado por</h2>
            {ticket.contact_name || ticket.contact_email || ticket.contact_phone ? (
              <>
                {ticket.contact_name && <p style={{ fontSize: 14, marginBottom: 4 }}>{ticket.contact_name}</p>}
                {ticket.contact_email && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{ticket.contact_email}</p>}
                {ticket.contact_phone && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{ticket.contact_phone}</p>}
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>No se indicó contacto.</p>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              {ticket.source === 'email' ? '📧 Recibido por email' : '👤 Abierto por el equipo'} · {new Date(ticket.created_at).toLocaleString('es-PR', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>Técnico asignado</h2>
            <TechnicianAssign ticketId={id} technicians={technicians ?? []} technicianId={ticket.technician_id} />
          </div>
        </div>
      </main>
    </div>
  );
}
