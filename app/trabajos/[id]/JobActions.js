'use client';
import { useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const statusOptionDefs = [
  { value: 'estimate',    key: 'estimate' },
  { value: 'scheduled',   key: 'scheduled' },
  { value: 'in_progress', key: 'in_progress' },
  { value: 'completed',   key: 'completed' },
  { value: 'cancelled',   key: 'cancelled' },
];

export default function JobActions({ jobId, status, showTechOnly = false, technicians = [], currentTechId = null }) {
  const t = useTranslations('trabajos.actions');
  const router = useRouter();
  const [newStatus, setNewStatus] = useState(status);
  const [techId, setTechId] = useState(currentTechId ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const statusOptions = useMemo(() => statusOptionDefs.map(o => ({ value: o.value, label: t(`status.${o.key}`) })), [t]);

  async function updateStatus(val) {
    setNewStatus(val);
    await supabase.from('jobs').update({ status: val }).eq('id', jobId);
    router.refresh();
  }

  async function assignTech(val) {
    setTechId(val);
    await supabase.from('jobs').update({ technician_id: val || null }).eq('id', jobId);
    if (val) {
      fetch('/api/trabajos/notify-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, technicianId: val }),
      }).catch(() => {});
    }
    router.refresh();
  }

  async function deleteJob() {
    setDeleting(true);
    await supabase.from('job_line_items').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      setDeleting(false);
      alert(t('deleteError', { error: error.message }));
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
          <option value="">{t('unassigned')}</option>
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
        style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
        onClick={() => setShowDelete(true)}
      >
        {t('delete')}
      </button>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteConfirmTitle')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteConfirmText')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteJob} disabled={deleting}
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
