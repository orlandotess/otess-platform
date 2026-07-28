import { HORA_INICIO, HORA_FIN, SLOT_WIDTH, formatHourLabel } from './dispatchUtils';
import GanttRow from './GanttRow';
import UnassignedLane from './UnassignedLane';

export default function GanttGrid({ technicians, jobsByTech, sinTecnicoJobs = [], absencesByTech = {} }) {
  const hours = [];
  for (let h = HORA_INICIO; h < HORA_FIN; h++) hours.push(h);

  return (
    <div style={{ minWidth: 'max-content' }}>
      <div className="dispatch-timeheader">
        <div className="dispatch-tech-col" />
        {hours.map(h => (
          <div key={h} className="dispatch-hour-cell" style={{ width: SLOT_WIDTH * 2 }}>
            {formatHourLabel(h)}
          </div>
        ))}
      </div>
      <UnassignedLane jobs={sinTecnicoJobs} />
      {technicians.length === 0 ? (
        <div className="empty" style={{ padding: 40 }}>
          <p>No hay técnicos activos. Agrega técnicos en Usuarios &amp; Roles.</p>
        </div>
      ) : (
        technicians.map((tech, i) => (
          <GanttRow key={tech.id} tecnico={tech} colorIndex={i} jobs={jobsByTech[tech.id] ?? []} absence={absencesByTech[tech.id]} />
        ))
      )}
    </div>
  );
}
