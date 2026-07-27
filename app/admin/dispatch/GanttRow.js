'use client';
import { useDroppable } from '@dnd-kit/core';
import JobCard from './JobCard';
import { HORA_INICIO, HORA_FIN, SLOT_MINUTOS, SLOT_WIDTH, techColor, minutesOfDayPR } from './dispatchUtils';

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

// Posición y ancho del job dentro de la fila, en px, recortado a la ventana visible del Gantt.
function jobPosition(job) {
  if (!job.scheduled_start) return null;
  const startMin = minutesOfDayPR(job.scheduled_start);
  const rawEndMin = job.scheduled_end ? minutesOfDayPR(job.scheduled_end) : startMin + 60;
  const clampedStart = Math.max(startMin, HORA_INICIO * 60);
  const clampedEnd = Math.min(rawEndMin > startMin ? rawEndMin : startMin + 60, HORA_FIN * 60);
  if (clampedStart >= HORA_FIN * 60 || clampedEnd <= HORA_INICIO * 60) return null;
  const left = ((clampedStart - HORA_INICIO * 60) / SLOT_MINUTOS) * SLOT_WIDTH;
  const width = Math.max(((clampedEnd - clampedStart) / SLOT_MINUTOS) * SLOT_WIDTH, SLOT_WIDTH / 2);
  return { left, width };
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
