'use client';
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import SearchBox from '../../SearchBox';
import JobCard from './JobCard';

export default function JobsPanel({ jobs, technicians = [] }) {
  const t = useTranslations('admin.dispatchJobsPanel');
  const [search, setSearch] = useState('');
  const { setNodeRef, isOver } = useDroppable({ id: 'panel_unassigned' });

  const query = search.trim().toLowerCase();
  const visible = query
    ? jobs.filter(j =>
        (j.title ?? '').toLowerCase().includes(query) ||
        (j.clients?.name ?? '').toLowerCase().includes(query))
    : jobs;

  return (
    <aside className="dispatch-panel">
      <div className="dispatch-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t('title')}</span>
          <span className="badge badge-gray">{jobs.length}</span>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} style={{ maxWidth: 'none' }} />
      </div>
      <div ref={setNodeRef} className={`dispatch-panel-list${isOver ? ' is-over' : ''}`}>
        {visible.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>
            {jobs.length === 0 ? t('emptyNone') : t('emptySearch', { search })}
          </p>
        ) : (
          visible.map(job => <JobCard key={job.id} job={job} technicians={technicians} />)
        )}
      </div>
    </aside>
  );
}
