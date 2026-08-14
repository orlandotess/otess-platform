'use client';
import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { STATUS_BADGE_DEFS, STATUS_TINT, assignedTechIds, techNames } from './dispatchUtils';
import TechAssignControl from './TechAssignControl';

function location(job) {
  return [job.property_name, job.city].filter(Boolean).join(' — ');
}

export default function JobCard({ job, compact, overlay, technicians = [], color = 'var(--info)' }) {
  const router = useRouter();
  const t = useTranslations('admin.dispatchJobCard');
  const readOnly = !!job.__readOnly;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.__dragId ?? job.id,
    disabled: readOnly,
  });
  const statusBadge = useMemo(() => Object.fromEntries(
    Object.entries(STATUS_BADGE_DEFS).map(([k, v]) => [k, { cls: v.cls, label: t(`status.${v.key}`) }])
  ), [t]);
  const badge = statusBadge[job.status] ?? statusBadge.estimate;
  const extraTechs = Math.max(assignedTechIds(job).length - 1, 0);
  const isExtraDay = job.schedule_day_id != null;
  const clientName = job.clients?.name ?? t('noClient');

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
    if (window.confirm(t('confirmOpen', { title: job.title }))) {
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
        title={`${clientName} — ${job.title}${isExtraDay ? ` ${t('extraDaySuffix')}` : ''}${readOnly ? ` ${t('readOnlySuffix')}` : ''}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isExtraDay && <span style={{ fontSize: 10, flexShrink: 0 }} title={t('extraDayTitle')}>📅</span>}
          <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clientName}
          </span>
          {extraTechs > 0 && (
            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--muted)' }} title={t('supportTechs', { count: extraTechs })}>
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
          {clientName}
        </span>
        {job.job_number && <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>#{job.job_number}</span>}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{job.title}</div>
      {location(job) && (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>📍 {location(job)}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>
      {techNames(job).length > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>👤 {techNames(job).join(', ')}</div>
      )}
      <TechAssignControl job={job} technicians={technicians} />
    </div>
  );
}
