'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const statusOptions = [
  { value: 'estimate',    label: 'Estimado' },
  { value: 'scheduled',   label: 'Programado' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed',   label: 'Completado' },
  { value: 'cancelled',   label: 'Cancelado' },
];

export default function JobActions({ jobId, status, showTechOnly = false, technicians = [], currentTechId = null }) {
  const router = useRouter();
  const [newStatus, setNewStatus] = useState(status);
  const [techId, setTechId] = useState(currentTechId ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  async function updateStatus(val) {
    setNewStatus(val);
    await supabase.from('jobs').update({ status: val }).eq('id', jobId);
    router.refresh();
  }

  async function assignTech(val) {
    setTechId(val);
    await supabase.from('jobs').update({ technician_id: val || null }).eq('id', jobId);
    router.refresh();
  }

  async function deleteJob() {
    setDeleting(true);
    await supabase.from('job_line_items').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar el trabajo: ' + error.message);
      return;
    }
    // Full reload (not router.push) so the trabajos list doesn't serve a
    // stale cached render of the just-deleted job.
    window.location.href = '/trabajos';
  }

  if (showTechOnly) {
    return (
      <div>
        <select
          value={techId}
          onChange={e => assignTech(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
        >
          <option value="">— Sin asignar —</option>
          {technicians.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <select
        value={newStatus}
        onChange={e => updateStatus(e.target.value)}
        style={{ padding: '9px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)', outline: 'none', cursor: 'pointer' }}
      >
        {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <button
        className="btn btn-ghost"
        style={{ color: 'var(--warn)', borderColor: '#fca5a5' }}
        onClick={() => setShowDelete(true)}
      >
        🗑 Eliminar
      </button>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar trabajo?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente y no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteJob} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
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
