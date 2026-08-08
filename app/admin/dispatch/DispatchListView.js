'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatTimePR } from '../../../lib/datetimeLocal';
import { pickMapsLink } from '../../../lib/mapsLinks';
import { STATUS_BADGE, techNames } from './dispatchUtils';
import TechAssignControl from './TechAssignControl';

function formatRange(job) {
  if (!job.scheduled_start) return '—';
  const start = formatTimePR(job.scheduled_start, { hour: 'numeric', minute: '2-digit' });
  if (!job.scheduled_end) return start;
  const end = formatTimePR(job.scheduled_end, { hour: 'numeric', minute: '2-digit' });
  return `${start} – ${end}`;
}

function location(job) {
  return [job.property_name, job.city].filter(Boolean).join(' — ');
}

function sortValue(job, key) {
  switch (key) {
    case 'hora': return job.scheduled_start ?? '';
    case 'cliente': return (job.clients?.name ?? '').toLowerCase();
    case 'tecnico': return techNames(job).join(', ').toLowerCase();
    case 'estado': return job.status ?? '';
    default: return '';
  }
}

const COLUMNS = [
  { key: 'hora', label: 'Hora' },
  { key: 'trabajo', label: 'Trabajo', sortable: false },
  { key: 'cliente', label: 'Cliente' },
  { key: 'ubicacion', label: 'Ubicación', sortable: false },
  { key: 'tecnico', label: 'Técnico(s)' },
  { key: 'estado', label: 'Estado' },
];

// Tabla del día actual (uno por job, sin duplicar filas por técnico como el
// Gantt) — mismos datos que ya trajo page.js, cero queries nuevas al cambiar
// de vista. Los días extra (job_schedule_days) no soportan reasignación
// multi-técnico vía TechAssignControl, solo drag-and-drop en el Gantt.
export default function DispatchListView({ jobs, technicians }) {
  const [sortKey, setSortKey] = useState('hora');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    const copy = [...jobs];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [jobs, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="dispatch-list card">
      {sorted.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
          No hay jobs programados para este día.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                    style={col.sortable === false ? undefined : { cursor: 'pointer', userSelect: 'none' }}
                  >
                    {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(job => {
                const badge = STATUS_BADGE[job.status] ?? STATUS_BADGE.estimate;
                const names = techNames(job);
                const isExtraDay = job.schedule_day_id != null;
                const jobId = job.job_id ?? job.id;
                const loc = location(job);
                return (
                  <tr key={job.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{formatRange(job)}</td>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/trabajos/${jobId}`} style={{ color: 'inherit' }}>{job.title}</Link>
                      {job.job_number && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>#{job.job_number}</span>}
                      {isExtraDay && <span style={{ marginLeft: 6, fontSize: 11 }} title="Día extra de un job multi-día">📅</span>}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{job.clients?.name ?? '—'}</td>
                    <td style={{ fontSize: 13 }}>
                      {loc ? (
                        (job.street || job.city) ? (
                          <a href={pickMapsLink(job.street, job.city, job.state, job.zip)} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--amber)', fontWeight: 600 }}>
                            📍 {loc}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>{loc}</span>
                        )
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>{names.length > 0 ? names.join(', ') : <span style={{ color: 'var(--muted)' }}>Sin técnico</span>}</div>
                      {!isExtraDay && <TechAssignControl job={job} technicians={technicians} />}
                    </td>
                    <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
