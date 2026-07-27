'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { STATUS_BADGE, STATUS_TINT } from './dispatchUtils';

function location(job) {
  return [job.property_name, job.city].filter(Boolean).join(' — ');
}

export default function JobCard({ job, compact, overlay, color = 'var(--info)' }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id });
  const badge = STATUS_BADGE[job.status] ?? STATUS_BADGE.estimate;

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !overlay ? 0.3 : 1,
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="dispatch-job"
        style={{
          ...style,
          borderLeftColor: color,
          background: STATUS_TINT[job.status] ?? 'var(--surface-2)',
          boxShadow: overlay ? 'var(--shadow-pop)' : 'var(--shadow-card)',
        }}
        title={`${job.clients?.name ?? 'Sin cliente'} — ${job.title}`}
      >
        <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job.clients?.name ?? 'Sin cliente'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job.title}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="dispatch-panel-card"
      style={{
        ...style,
        borderLeftColor: 'var(--amber)',
        background: STATUS_TINT[job.status] ?? 'var(--surface-2)',
        boxShadow: overlay ? 'var(--shadow-pop)' : undefined,
        width: overlay ? 260 : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.clients?.name ?? 'Sin cliente'}
        </span>
        {job.job_number && <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>#{job.job_number}</span>}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{job.title}</div>
      {location(job) && (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>📍 {location(job)}</div>
      )}
      <span className={`badge ${badge.cls}`} style={{ marginTop: 6 }}>{badge.label}</span>
    </div>
  );
}
