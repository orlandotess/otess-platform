'use client';
import { useDroppable } from '@dnd-kit/core';
import JobCard from './JobCard';
import { HORA_INICIO, HORA_FIN, SLOT_MINUTOS, SLOT_WIDTH, techColor, jobPosition } from './dispatchUtils';

function GanttSlot({ technicianId, hour, minute }) {
  const id = `slot_${technicianId}_${hour}_${minute}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`dispatch-slot${minute === 0 ? ' hour-start' : ''}${isOver ? ' is-over' : ''}`}
      style={{ width: SLOT_WIDTH }}
    />
  );
}

export default function GanttRow({ tecnico, colorIndex, jobs }) {
  const slots = [];
  for (let h = HORA_INICIO; h < HORA_FIN; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTOS) slots.push({ hour: h, minute: m });
  }
  const color = techColor(colorIndex);

  return (
    <div className="dispatch-row">
      <div className="dispatch-tech-name">
        <div className="dispatch-tech-avatar" style={{ background: color }}>
          {tecnico.name.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tecnico.name}
        </span>
      </div>
      <div className="dispatch-slots">
        {slots.map(s => (
          <GanttSlot key={`${s.hour}-${s.minute}`} technicianId={tecnico.id} hour={s.hour} minute={s.minute} />
        ))}
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
