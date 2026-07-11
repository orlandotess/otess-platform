'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';

export default function TicketActions({ ticketId, status, clientId }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [clients, setClients] = useState([]);
  const [assignClientId, setAssignClientId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (showAssign && clients.length === 0) {
      supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    }
  }, [showAssign]);

  async function updateStatus(newStatus) {
    await supabase.from('service_tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ticketId);
    router.refresh();
  }

  async function assignClient() {
    if (!assignClientId) return;
    setAssigning(true);
    await supabase.from('service_tickets').update({ client_id: assignClientId, updated_at: new Date().toISOString() }).eq('id', ticketId);
    setAssigning(false);
    setShowAssign(false);
    router.refresh();
  }

  async function deleteTicket() {
    setDeleting(true);
    const { error } = await supabase.from('service_tickets').delete().eq('id', ticketId);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar el boleto: ' + error.message);
      return;
    }
    window.location.href = '/boletos';
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {clientId ? (
        <Link href={`/trabajos/nuevo?client=${clientId}`} className="btn btn-ghost">🔧 Convertir a trabajo</Link>
      ) : (
        <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowAssign(true)}>⚠️ Asignar cliente</button>
      )}

      {status === 'abierto' && <button className="btn btn-primary" onClick={() => updateStatus('en_progreso')}>▶️ Marcar en progreso</button>}
      {status === 'en_progreso' && (
        <>
          <button className="btn btn-primary" onClick={() => updateStatus('cerrado')}>✅ Cerrar</button>
          <button className="btn btn-ghost" onClick={() => updateStatus('abierto')}>Revertir a abierto</button>
        </>
      )}
      {status === 'cerrado' && (
        <button className="btn btn-ghost" onClick={() => updateStatus('en_progreso')}>Reabrir</button>
      )}

      <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowDelete(true)}>🗑</button>

      {showAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>Asignar a un cliente</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>No encontramos ningún cliente con ese correo. Búscalo manualmente.</p>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <ClientCombobox clients={clients} value={assignClientId} onChange={setAssignClientId} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={assignClient} disabled={!assignClientId || assigning} style={{ flex: 1, justifyContent: 'center' }}>
                {assigning ? 'Guardando...' : 'Asignar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAssign(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar boleto?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteTicket} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
