'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { STATUS_BADGE, STATUS_TINT, assignedTechIds } from './dispatchUtils';

function location(job) {
  return [job.property_name, job.city].filter(Boolean).join(' — ');
}

export default function JobCard({ job, compact, overlay, color = 'var(--info)' }) {
  const router = useRouter();
  const readOnly = !!job.__readOnly;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.__dragId ?? job.id,
    disabled: readOnly,
  });
  const badge = STATUS_BADGE[job.status] ?? STATUS_BADGE.estimate;
  const extraTechs = Math.max(assignedTechIds(job).length - 1, 0);
  const isExtraDay = job.schedule_day_id != null;

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !overlay ? 0.3 : readOnly ? 0.7 : 1,
    cursor: readOnly ? 'pointer' : undefined,
  };

  // El drag necesita moverse 8px para activarse (ver activationConstraint en
  // DispatchBoard), así que un click sin arrastre siempre llega hasta acá.
  function handleClick() {
    if (overlay) return;
    const jobId = job.job_id ?? job.id;
    if (window.confirm(`¿Quieres abrir "${job.title}"?`)) {
      router.push(`/trabajos/${jobId}`);
    }
  }

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={handleClick}
        className="dispatch-job"
        style={{
          ...style,
          borderLeftColor: color,
          borderLeftStyle: readOnly ? 'dashed' : 'solid',
          background: STATUS_TINT[job.status] ?? 'var(--surface-2)',
          boxShadow: overlay ? 'var(--shadow-pop)' : 'var(--shadow-card)',
        }}
        title={`${job.clients?.name ?? 'Sin cliente'} — ${job.title}${isExtraDay ? ' (día extra)' : ''}${readOnly ? ' (también asignado acá — arrastra desde su fila principal)' : ''}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isExtraDay && <span style={{ fontSize: 10, flexShrink: 0 }} title="Día extra de un job multi-día">📅</span>}
          <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {job.clients?.name ?? 'Sin cliente'}
          </span>
          {extraTechs > 0 && (
            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--muted)' }} title={`+${extraTechs} técnico(s) de apoyo`}>
              +{extraTechs}
            </span>
          )}
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
      onClick={handleClick}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        {extraTechs > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }} title={`+${extraTechs} técnico(s) de apoyo`}>
            +{extraTechs} téc.
          </span>
        )}
      </div>
    </div>
  );
}
