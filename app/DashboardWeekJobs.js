'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { localInputToIso } from '../lib/datetimeLocal';
import QuickRescheduleModal from './calendario/QuickRescheduleModal';

const STATUS_LABELS = {
  estimate: 'Estimado', scheduled: 'Programado', in_progress: 'En progreso',
  completed: 'Completado', cancelled: 'Cancelado',
};

const STATUS_BADGE_CLS = {
  estimate: 'badge-gray', scheduled: 'badge-blue', in_progress: 'badge-amber',
  completed: 'badge-green', cancelled: 'badge-red',
};

const fmtTime = iso => new Date(iso).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = iso => new Date(iso).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });

export default function DashboardWeekJobs({ jobs, techColors, canQuickReschedule }) {
  const router = useRouter();
  const [quickReschedule, setQuickReschedule] = useState(null);
  const [saving, setSaving] = useState(false);

  function openJob(job) {
    if (canQuickReschedule) { setQuickReschedule(job); return; }
    router.push(`/trabajos/${job.id}`);
  }

  async function saveQuickReschedule(form) {
    setSaving(true);
    const { error } = await supabase.from('jobs').update({
      scheduled_start: localInputToIso(form.start),
      scheduled_end: localInputToIso(form.end),
    }).eq('id', quickReschedule.id);
    setSaving(false);
    if (error) { alert('Error al mover la fecha: ' + error.message); return; }
    setQuickReschedule(null);
    router.refresh();
  }

  if (jobs.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No hay trabajos esta semana.</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
        {jobs.map(j => {
          const badge = STATUS_BADGE_CLS[j.status] ?? 'badge-gray';
          return (
            <div key={j.id} onClick={() => openJob(j)}
              style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start', userSelect: 'none', WebkitUserSelect: 'none' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: techColors[j.technician_id] ?? 'var(--ink-faint)', marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                  <span className={`badge ${badge}`} style={{ fontSize: 10, flexShrink: 0 }}>{STATUS_LABELS[j.status] ?? j.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{j.clients?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {fmtDay(j.scheduled_start)} · {fmtTime(j.scheduled_start)} {j.technicians?.name ? `· ${j.technicians.name}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {quickReschedule && (
        <QuickRescheduleModal
          data={{ type: 'job', item: quickReschedule }}
          saving={saving}
          onClose={() => setQuickReschedule(null)}
          onSave={saveQuickReschedule}
          onViewDetails={() => router.push(`/trabajos/${quickReschedule.id}`)}
        />
      )}
    </>
  );
}
