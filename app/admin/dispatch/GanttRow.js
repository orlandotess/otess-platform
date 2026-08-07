'use client';
import { useDroppable } from '@dnd-kit/core';
import JobCard from './JobCard';
import { HORA_INICIO, HORA_FIN, SLOT_MINUTOS, SLOT_WIDTH, techColor, jobPosition } from './dispatchUtils';

function GanttSlot({ technicianId, hour, minute, disabled }) {
  const id = `slot_${technicianId}_${hour}_${minute}`;
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`dispatch-slot${minute === 0 ? ' hour-start' : ''}${isOver ? ' is-over' : ''}`}
      style={{ width: SLOT_WIDTH }}
    />
  );
}

export default function GanttRow({ tecnico, colorIndex, jobs, absence, openEntry }) {
  const slots = [];
  for (let h = HORA_INICIO; h < HORA_FIN; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTOS) slots.push({ hour: h, minute: m });
  }
  const color = techColor(colorIndex);

  return (
    <div className={`dispatch-row${absence ? ' dispatch-row-absent' : ''}`}>
      <div className="dispatch-tech-name">
        <div className="dispatch-tech-avatar" style={{ background: absence ? 'var(--warn)' : color }}>
          {tecnico.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tecnico.name}
            </span>
            {absence && (
              <span className="badge badge-red" style={{ flexShrink: 0 }} title={absence}>🚫 Ausente</span>
            )}
          </div>
          {openEntry && (
            <div
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={`Clockeado en: ${openEntry.clientName ?? 'Sin cliente'} — ${openEntry.title}`}
            >
              🟢 {openEntry.jobNumber ? `#${openEntry.jobNumber} — ` : ''}{openEntry.title}
            </div>
          )}
        </div>
      </div>
      <div className="dispatch-slots">
        {slots.map(s => (
          <GanttSlot key={`${s.hour}-${s.minute}`} technicianId={tecnico.id} hour={s.hour} minute={s.minute} disabled={!!absence} />
        ))}
        {absence && (
          <div className="dispatch-absent-overlay" title={`Ausente: ${absence}`} />
        )}
        {jobs.map(job => {
          const pos = jobPosition(job);
          if (!pos) return null;
          return (
            <div key={job.id} style={{ position: 'absolute', left: pos.left, width: pos.width, top: 4, bottom: 4 }}>
              <JobCard job={job} compact color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
