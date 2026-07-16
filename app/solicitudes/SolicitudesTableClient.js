'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { pickMapsLink } from '../../lib/mapsLinks';
import { formatDatePR } from '../../lib/datetimeLocal';

const statusBadge = {
  nueva:                { cls: 'badge-blue',  label: 'Nueva' },
  necesita_aprobacion:  { cls: 'badge-amber', label: 'Necesita aprobación' },
  evaluacion_completa:  { cls: 'badge-green', label: 'Evaluación completa' },
  convertida:           { cls: 'badge-dark',  label: 'Convertida' },
  archivada:            { cls: 'badge-gray',  label: 'Archivada' },
};

const OVERDUE_DAYS = 7;
const OPEN_STATUSES = ['nueva', 'necesita_aprobacion'];

function isOverdue(s) {
  if (!OPEN_STATUSES.includes(s.status)) return false;
  const days = (Date.now() - new Date(s.requested_on).getTime()) / 86400000;
  return days > OVERDUE_DAYS;
}

function isUnscheduled(s) {
  return OPEN_STATUSES.includes(s.status) && !s.assessment_date;
}

function location(s) {
  return [s.property_name, s.city].filter(Boolean).join(' — ');
}

const FILTERS = [
  { id: 'all',                 label: 'Todas' },
  { id: 'nueva',                label: 'Nueva' },
  { id: 'necesita_aprobacion',  label: 'Necesita aprobación' },
  { id: 'evaluacion_completa',  label: 'Evaluación completa' },
  { id: 'overdue',              label: 'Atrasada' },
  { id: 'unscheduled',          label: 'Sin programar' },
];

export default function SolicitudesTableClient({ solicitudes }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const counts = {
    all: solicitudes.length,
    nueva: solicitudes.filter(s => s.status === 'nueva').length,
    necesita_aprobacion: solicitudes.filter(s => s.status === 'necesita_aprobacion').length,
    evaluacion_completa: solicitudes.filter(s => s.status === 'evaluacion_completa').length,
    overdue: solicitudes.filter(isOverdue).length,
    unscheduled: solicitudes.filter(isUnscheduled).length,
  };

  let filtered = solicitudes;
  if (filter === 'overdue') filtered = solicitudes.filter(isOverdue);
  else if (filter === 'unscheduled') filtered = solicitudes.filter(isUnscheduled);
  else if (filter !== 'all') filtered = solicitudes.filter(s => s.status === filter);

  const query = search.trim().toLowerCase();
  const visible = query
    ? filtered.filter(s =>
        (s.title ?? '').toLowerCase().includes(query) ||
        (s.clients?.name ?? '').toLowerCase().includes(query) ||
        (s.property_name ?? '').toLowerCase().includes(query) ||
        (s.street ?? '').toLowerCase().includes(query) ||
        (s.city ?? '').toLowerCase().includes(query))
    : filtered;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="card"
            style={{
              cursor: 'pointer', textAlign: 'left', border: filter === f.id ? '1.5px solid var(--amber)' : '1.5px solid var(--border)',
              background: filter === f.id ? 'var(--amber-tint)' : 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{counts[f.id]}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{f.label}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar solicitud, cliente o ubicación..." />
        </div>
        {visible.length === 0 ? (
          <div className="empty"><p>Sin resultados.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Solicitud</th>
                  <th>Cliente</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th>Solicitada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(s => {
                  const b = statusBadge[s.status] ?? statusBadge.nueva;
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>
                        {s.title}
                        {s.solicitud_number && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.solicitud_number}</span>}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{s.clients?.name ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {location(s) ? (
                          (s.street || s.city) ? (
                            <a href={pickMapsLink(s.street, s.city, s.state, s.zip)} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--amber)', fontWeight: 600 }}>
                              📍 {location(s)}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>{location(s)}</span>
                          )
                        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                        {isOverdue(s) && <span className="badge badge-red" style={{ marginLeft: 6 }}>Atrasada</span>}
                        {isUnscheduled(s) && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Sin programar</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                        {s.requested_on ? formatDatePR(s.requested_on) : '—'}
                      </td>
                      <td><Link href={`/solicitudes/${s.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
