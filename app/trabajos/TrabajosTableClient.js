'use client';
import { useEffect, useMemo, useState } from 'react';
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

// Orden al tocar los encabezados (mismo estilo que la lista de Dispatch). Sin
// columna escogida se queda el orden de siempre: los más nuevos primero.
// El estado sigue el flujo del trabajo, no el abecedario.
const STATUS_ORDER = { estimate: 0, scheduled: 1, in_progress: 2, completed: 3, cancelled: 4 };
const SORT_STORAGE_KEY = 'trabajos.sort';

function sortValue(j, key) {
  switch (key) {
    // JOB-1078 → 1078, para que JOB-999 quede antes que JOB-1000.
    case 'number': return j.job_number ? parseInt(String(j.job_number).replace(/\D/g, ''), 10) || 0 : null;
    case 'job': return (j.title ?? '').toLowerCase() || null;
    case 'client': return (j.clients?.name ?? '').toLowerCase() || null;
    case 'location': return location(j).toLowerCase() || null;
    case 'status': return STATUS_ORDER[j.status] ?? 99;
    case 'scheduledDate': return j.scheduled_start ?? null;
    default: return null;
  }
}

const COLUMN_KEYS = ['number', 'job', 'client', 'location', 'status', 'scheduledDate'];

// Filtro por estado (tarjetas con conteo, como en Solicitudes). "Activos" junta
// lo que todavía está pendiente; "Todos" es el de siempre.
const ACTIVE_STATUSES = ['estimate', 'scheduled', 'in_progress'];
const FILTER_IDS = ['all', 'active', 'estimate', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const FILTER_STORAGE_KEY = 'trabajos.statusFilter';

function normalize(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesFilter(j, filter) {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.includes(j.status);
  return j.status === filter;
}

export default function TrabajosTableClient({ jobs }) {
  const t = useTranslations('trabajos.listTable');
  const locale = useLocale();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [filter, setFilter] = useState('all');

  // Recordar el orden escogido en este navegador (solo comodidad: si falla, se
  // usa el orden de siempre).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? 'null');
      if (saved && COLUMN_KEYS.includes(saved.key) && ['asc', 'desc'].includes(saved.dir)) setSort(saved);
      const savedFilter = localStorage.getItem(FILTER_STORAGE_KEY);
      if (FILTER_IDS.includes(savedFilter)) setFilter(savedFilter);
    } catch {}
  }, []);

  function chooseFilter(id) {
    setFilter(id);
    try { localStorage.setItem(FILTER_STORAGE_KEY, id); } catch {}
  }

  function toggleSort(key) {
    setSort(prev => {
      // asc → desc → orden de siempre
      const next = prev.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' };
      try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

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

  // Los conteos son sobre todos los trabajos, sin importar la búsqueda.
  const counts = Object.fromEntries(FILTER_IDS.map(id => [id, jobs.filter(j => matchesFilter(j, id)).length]));
  const byStatus = jobs.filter(j => matchesFilter(j, filter));

  // Cada palabra tiene que aparecer en alguno de los campos, incluido el nombre
  // del estado en el idioma de la pantalla: "instant programado" = trabajos
  // programados de Instant Pixel. Sin acentos ni mayúsculas ("diaz" = "Díaz").
  const query = search.trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const visible = words.length
    ? byStatus.filter(j => {
        const haystack = normalize([
          j.title, j.job_number, j.clients?.name, j.property_name, j.street, j.city,
          statusBadge[j.status]?.label,
        ].filter(Boolean).join(' '));
        return words.every(w => haystack.includes(w));
      })
    : byStatus;

  const sorted = useMemo(() => {
    if (!sort.key) return visible;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...visible].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Los vacíos (sin fecha, sin cliente…) siempre al final, en cualquier dirección.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv, 'es') * dir;
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }, [visible, sort]);

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
      {FILTER_IDS.map(id => (
        <button key={id} onClick={() => chooseFilter(id)} className="card" aria-pressed={filter === id}
          style={{ cursor: 'pointer', textAlign: 'left', border: filter === id ? '1.5px solid var(--amber)' : '1.5px solid var(--border)', background: filter === id ? 'var(--amber-tint)' : 'var(--surface)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{counts[id]}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{t(`filters.${id}`)}</div>
        </button>
      ))}
    </div>
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>{query ? t('noResults', { search }) : t('noResultsFilter', { filter: t(`filters.${filter}`) })}</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMN_KEYS.map(key => (
                  <th key={key} onClick={() => toggleSort(key)} title={t('sortTitle')}
                    aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {t(`columns.${key}`)}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(j => {
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
    </>
  );
}
