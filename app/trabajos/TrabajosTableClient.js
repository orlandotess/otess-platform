'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { pickMapsLink } from '../../lib/mapsLinks';
import { formatDatePR } from '../../lib/datetimeLocal';

const statusBadge = {
  estimate:    { cls: 'badge-gray',  label: 'Estimado' },
  scheduled:   { cls: 'badge-blue',  label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed:   { cls: 'badge-green', label: 'Completado' },
  cancelled:   { cls: 'badge-red',   label: 'Cancelado' },
};

function location(j) {
  return [j.property_name, j.city].filter(Boolean).join(' — ');
}

export default function TrabajosTableClient({ jobs }) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visible = query
    ? jobs.filter(j =>
        (j.title ?? '').toLowerCase().includes(query) ||
        (j.clients?.name ?? '').toLowerCase().includes(query) ||
        (j.property_name ?? '').toLowerCase().includes(query) ||
        (j.street ?? '').toLowerCase().includes(query) ||
        (j.city ?? '').toLowerCase().includes(query))
    : jobs;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar trabajo, cliente o ubicación..." />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>Sin resultados para "{search}".</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trabajo</th>
                <th>Cliente</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Fecha programada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(j => {
                const b = statusBadge[j.status] ?? statusBadge.estimate;
                return (
                  <tr key={j.id}>
                    <td style={{ fontWeight: 600 }}>{j.title}</td>
                    <td style={{ color: 'var(--muted)' }}>{j.clients?.name ?? '—'}</td>
                    <td style={{ fontSize: 13 }}>
                      {location(j) ? (
                        (j.street || j.city) ? (
                          <a href={pickMapsLink(j.street, j.city, j.state, j.zip)} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--amber)', fontWeight: 600 }}>
                            📍 {location(j)}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>{location(j)}</span>
                        )
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {j.scheduled_start ? formatDatePR(j.scheduled_start) : '—'}
                    </td>
                    <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
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
