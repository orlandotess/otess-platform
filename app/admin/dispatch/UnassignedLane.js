import JobCard from './JobCard';
import { HORA_INICIO, HORA_FIN, SLOT_MINUTOS, SLOT_WIDTH, jobPosition } from './dispatchUtils';

// Jobs que ya tienen hora para este día pero ningún técnico asignado — sin esta fila
// quedaban invisibles (solo vivían en el panel "Sin asignar", que no está filtrado por día).
export default function UnassignedLane({ jobs }) {
  if (jobs.length === 0) return null;
  const totalWidth = ((HORA_FIN - HORA_INICIO) * 60 / SLOT_MINUTOS) * SLOT_WIDTH;

  return (
    <div className="dispatch-row dispatch-row-unassigned">
      <div className="dispatch-tech-name">
        <div className="dispatch-tech-avatar dispatch-tech-avatar-empty">!</div>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Sin técnico
        </span>
      </div>
      <div className="dispatch-slots">
        <div style={{ width: totalWidth, height: '100%' }} />
        {jobs.map(job => {
          const pos = jobPosition(job);
          if (!pos) return null;
          return (
            <div key={job.id} style={{ position: 'absolute', left: pos.left, width: pos.width, top: 4, bottom: 4 }}>
              <JobCard job={job} compact color="var(--warn)" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
