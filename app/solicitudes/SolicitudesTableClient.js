'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { pickMapsLink } from '../../lib/mapsLinks';
import { formatDatePR } from '../../lib/datetimeLocal';
import { useTranslations, useLocale } from 'next-intl';

const statusBadgeCls = {
  nueva:                'badge-blue',
  necesita_aprobacion:  'badge-amber',
  evaluacion_completa:  'badge-green',
  convertida:           'badge-dark',
  archivada:            'badge-gray',
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

function technicianNames(s) {
  return [s.technicians?.name, ...(s.solicitud_technicians ?? []).map(st => st.technicians?.name)].filter(Boolean).join(', ');
}

const FILTER_IDS = ['all', 'nueva', 'necesita_aprobacion', 'evaluacion_completa', 'overdue', 'unscheduled'];

export default function SolicitudesTableClient({ solicitudes }) {
  const t = useTranslations('solicitudes.listTable');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const statusBadge = useMemo(() => Object.fromEntries(
    Object.entries(statusBadgeCls).map(([k, cls]) => [k, { cls, label: t(`status.${k}`) }])
  ), [t]);

  const FILTERS = useMemo(() => FILTER_IDS.map(id => ({ id, label: t(`filters.${id}`) })), [t]);

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
          <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        {visible.length === 0 ? (
          <div className="empty"><p>{t('noResults')}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('columns.solicitud')}</th>
                  <th>{t('columns.client')}</th>
                  <th>{t('columns.location')}</th>
                  <th>{t('columns.technician')}</th>
                  <th>{t('columns.status')}</th>
                  <th>{t('columns.requested')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(s => {
                  const b = statusBadge[s.status] ?? statusBadge.nueva;
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/solicitudes/${s.id}`} style={{ color: 'inherit' }}>
                          {s.title}
                          {s.solicitud_number && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.solicitud_number}</span>}
                        </Link>
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
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {technicianNames(s) || '—'}
                      </td>
                      <td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                        {isOverdue(s) && <span className="badge badge-red" style={{ marginLeft: 6 }}>{t('filters.overdue')}</span>}
                        {isUnscheduled(s) && <span className="badge badge-gray" style={{ marginLeft: 6 }}>{t('filters.unscheduled')}</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                        {s.requested_on ? formatDatePR(s.requested_on, {}, locale === 'en' ? 'en-US' : 'es-PR') : '—'}
                      </td>
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
