'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SearchBox from '../SearchBox';
import JobNumberLink from '../components/JobNumberLink';
import ClientLink from '../components/ClientLink';
import { pickMapsLink } from '../../lib/mapsLinks';
import { formatDatePR } from '../../lib/datetimeLocal';
import { useTranslations, useLocale } from 'next-intl';

const statusBadgeDefs = {
  estimate:    { cls: 'badge-gray',  key: 'estimate' },
  scheduled:   { cls: 'badge-blue',  key: 'scheduled' },
  in_progress: { cls: 'badge-amber', key: 'in_progress' },
  completed:   { cls: 'badge-green', key: 'completed' },
  cancelled:   { cls: 'badge-red',   key: 'cancelled' },
};

function location(j) {
  return [j.property_name, j.city].filter(Boolean).join(' — ');
}

export default function TrabajosTableClient({ jobs }) {
  const t = useTranslations('trabajos.listTable');
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState('');

  // Toda la fila abre el trabajo. Los enlaces de adentro (número, título, mapa)
  // siguen funcionando solos; Cmd/Ctrl+clic en la fila lo abre en otra pestaña.
  function openJob(e, id) {
    if (e.target.closest('a, button, input, select, textarea')) return;
    if (window.getSelection()?.toString()) return; // estaba seleccionando texto
    const href = `/trabajos/${id}`;
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
    else router.push(href);
  }

  const statusBadge = useMemo(() => Object.fromEntries(
    Object.entries(statusBadgeDefs).map(([k, v]) => [k, { cls: v.cls, label: t(`status.${v.key}`) }])
  ), [t]);

  const query = search.trim().toLowerCase();
  const visible = query
    ? jobs.filter(j =>
        (j.title ?? '').toLowerCase().includes(query) ||
        (j.job_number ?? '').toLowerCase().includes(query) ||
        (j.clients?.name ?? '').toLowerCase().includes(query) ||
        (j.property_name ?? '').toLowerCase().includes(query) ||
        (j.street ?? '').toLowerCase().includes(query) ||
        (j.city ?? '').toLowerCase().includes(query))
    : jobs;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>{t('noResults', { search })}</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('columns.number')}</th>
                <th>{t('columns.job')}</th>
                <th>{t('columns.client')}</th>
                <th>{t('columns.location')}</th>
                <th>{t('columns.status')}</th>
                <th>{t('columns.scheduledDate')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(j => {
                const b = statusBadge[j.status] ?? statusBadge.estimate;
                return (
                  <tr key={j.id} className="row-link" onClick={e => openJob(e, j.id)}>
                    <td style={{ fontSize: 13 }}>
                      <JobNumberLink jobId={j.id} jobNumber={j.job_number} empty={<span style={{ color: 'var(--muted)' }}>—</span>} />
                    </td>
                    <td style={{ fontWeight: 600 }}><Link href={`/trabajos/${j.id}`} style={{ color: 'inherit' }}>{j.title}</Link></td>
                    <td style={{ color: 'var(--muted)' }}><ClientLink clientId={j.clients?.id} name={j.clients?.name} empty="—" /></td>
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
                      {j.scheduled_start ? formatDatePR(j.scheduled_start, {}, locale === 'en' ? 'en-US' : 'es-PR') : '—'}
                    </td>
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
