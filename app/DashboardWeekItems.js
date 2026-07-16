'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { localInputToIso, formatTimePR, formatDatePR } from '../lib/datetimeLocal';
import QuickRescheduleModal from './calendario/QuickRescheduleModal';

const STATUS_LABELS = {
  estimate: 'Estimado', scheduled: 'Programado', in_progress: 'En progreso',
  completed: 'Completado', cancelled: 'Cancelado',
};
const STATUS_BADGE_CLS = {
  estimate: 'badge-gray', scheduled: 'badge-blue', in_progress: 'badge-amber',
  completed: 'badge-green', cancelled: 'badge-red',
};
const ENTRY_TYPE_ICONS = { event: '📌', reminder: '🔔', checklist: '☑' };

const fmtTime = iso => formatTimePR(iso, { hour: '2-digit', minute: '2-digit' });
const fmtDay = iso => formatDatePR(iso, { weekday: 'short', month: 'short', day: 'numeric' });

export default function DashboardWeekItems({ jobs, visits, events, tasks, absences, techColors, canQuickReschedule }) {
  const router = useRouter();
  const [quickReschedule, setQuickReschedule] = useState(null); // { type, item }
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => {
    const list = [
      ...jobs.map(j => ({ kind: 'job', sortAt: j.scheduled_start, data: j })),
      ...visits.map(v => ({ kind: 'visit', sortAt: v.scheduled_at, data: v })),
      ...events.map(e => ({ kind: 'event', sortAt: e.start_at, data: e })),
      ...tasks.map(t => ({ kind: 'task', sortAt: t.due_at, data: t })),
      ...absences.map(a => ({ kind: 'absence', sortAt: `${a.date}T00:00:00`, data: a })),
    ];
    return list.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  }, [jobs, visits, events, tasks, absences]);

  function openItem(kind, data) {
    if ((kind === 'job' || kind === 'event' || kind === 'task') && canQuickReschedule) {
      setQuickReschedule({ type: kind, item: data });
      return;
    }
    if (kind === 'job') router.push(`/trabajos/${data.id}`);
    else if (kind === 'visit') router.push(`/solicitudes/${data.request_id}`);
    else if (kind === 'event' || kind === 'task') router.push('/calendario?view=week');
  }

  async function saveQuickReschedule(form) {
    const { type, item } = quickReschedule;
    setSaving(true);
    let error;
    if (type === 'task') {
      ({ error } = await supabase.from('tasks').update({ due_at: localInputToIso(form.due) }).eq('id', item.id));
    } else if (type === 'event') {
      ({ error } = await supabase.from('calendar_events').update({
        start_at: localInputToIso(form.start), end_at: localInputToIso(form.end),
      }).eq('id', item.id));
    } else {
      ({ error } = await supabase.from('jobs').update({
        scheduled_start: localInputToIso(form.start), scheduled_end: localInputToIso(form.end),
      }).eq('id', item.id));
    }
    setSaving(false);
    if (error) { alert('Error al mover la fecha: ' + error.message); return; }
    setQuickReschedule(null);
    router.refresh();
  }

  if (items.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No hay nada programado esta semana.</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
        {items.map(({ kind, data, sortAt }) => {
          if (kind === 'absence') {
            return (
              <div key={`a${data.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>
                🚫 {data.technicians?.name ?? 'Técnico'} ausente · {fmtDay(sortAt)}
              </div>
            );
          }

          const dotColor = techColors[data.technician_id] ?? 'var(--ink-faint)';
          const title = kind === 'visit' ? (data.requests?.title ?? 'Visita') : data.title;
          const clientName = kind === 'visit' ? data.requests?.clients?.name : data.clients?.name;
          const icon = kind === 'event' ? ENTRY_TYPE_ICONS.event : kind === 'task' ? ENTRY_TYPE_ICONS[data.task_type] : kind === 'visit' ? '👁' : null;
          const badge = kind === 'job' ? (STATUS_BADGE_CLS[data.status] ?? 'badge-gray') : null;

          return (
            <div key={`${kind}${data.id}`} onClick={() => openItem(kind, data)}
              style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start',
                userSelect: 'none', WebkitUserSelect: 'none', opacity: kind === 'task' && data.completed ? 0.6 : 1 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: kind === 'task' && data.completed ? 'line-through' : 'none' }}>
                    {icon ? `${icon} ` : ''}{title}
                  </div>
                  {badge && <span className={`badge ${badge}`} style={{ fontSize: 10, flexShrink: 0 }}>{STATUS_LABELS[data.status] ?? data.status}</span>}
                </div>
                {clientName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{clientName}</div>}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {fmtDay(sortAt)} · {fmtTime(sortAt)} {data.technicians?.name ? `· ${data.technicians.name}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {quickReschedule && (
        <QuickRescheduleModal
          data={quickReschedule}
          saving={saving}
          onClose={() => setQuickReschedule(null)}
          onSave={saveQuickReschedule}
          onViewDetails={quickReschedule.type === 'job'
            ? () => router.push(`/trabajos/${quickReschedule.item.id}`)
            : () => router.push('/calendario?view=week')}
        />
      )}
    </>
  );
}
