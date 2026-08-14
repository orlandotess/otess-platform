'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';
import { useTranslations } from 'next-intl';

export default function TicketActions({ ticketId, status, clientId }) {
  const t = useTranslations('boletos.actions');
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
    const now = new Date().toISOString();
    await supabase.from('service_tickets').update({
      status: newStatus,
      updated_at: now,
      resolved_at: newStatus === 'cerrado' ? now : null,
    }).eq('id', ticketId);
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
      alert(t('deleteError', { error: error.message }));
      return;
    }
    window.location.href = '/boletos';
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {clientId ? (
        <Link href={`/trabajos/nuevo?client=${clientId}`} className="btn btn-ghost">{t('convertToJob')}</Link>
      ) : (
        <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => setShowAssign(true)}>⚠️ {t('assignClient')}</button>
      )}

      {status === 'abierto' && <button className="btn btn-primary" onClick={() => updateStatus('en_progreso')}>{t('markInProgress')}</button>}
      {status === 'en_progreso' && (
        <>
          <button className="btn btn-primary" onClick={() => updateStatus('cerrado')}>{t('close')}</button>
          <button className="btn btn-ghost" onClick={() => updateStatus('abierto')}>{t('revertToOpen')}</button>
        </>
      )}
      {status === 'cerrado' && (
        <button className="btn btn-ghost" onClick={() => updateStatus('en_progreso')}>{t('reopen')}</button>
      )}

      <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => setShowDelete(true)}>🗑</button>

      {showAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('assignModalTitle')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>{t('assignModalText')}</p>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <ClientCombobox clients={clients} value={assignClientId} onChange={setAssignClientId} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={assignClient} disabled={!assignClientId || assigning} style={{ flex: 1, justifyContent: 'center' }}>
                {assigning ? t('saving') : t('assign')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAssign(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteConfirmTitle')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteConfirmText')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteTicket} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? t('deleting') : t('confirmDelete')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
