export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../lib/supabase';
import { formatDatePR, formatTimePR } from '../../lib/datetimeLocal';
import Sidebar from '../Sidebar';
import Link from 'next/link';
import EstimadosTableClient from './EstimadosTableClient';
import { getTranslations, getLocale } from 'next-intl/server';

const statusBadge = {
  draft:     { cls: 'badge-gray',  key: 'draft' },
  sent:      { cls: 'badge-blue',  key: 'sent' },
  accepted:  { cls: 'badge-green', key: 'accepted' },
  cancelled: { cls: 'badge-red',   key: 'cancelled' },
  converted: { cls: 'badge-amber', key: 'converted' },
};

function formatViewedAt(dateStr, locale, t) {
  const isToday = formatDatePR(dateStr, {}, 'en-CA') === formatDatePR(new Date(), {}, 'en-CA');
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  if (isToday) {
    return t('today', { time: formatTimePR(dateStr, { hour: '2-digit', minute: '2-digit' }, dateLocale) });
  }
  return formatDatePR(dateStr, { month: 'short', day: 'numeric' }, dateLocale);
}

export default async function EstimadosPage(props) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('estimados.list');
  const locale = await getLocale();
  const showArchived = searchParams?.archived === '1';

  const [{ data: allEstimates }, { data: views }] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, estimate_number, title, status, total, issued_at, valid_until, archived_at, clients(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('estimate_views')
      .select('estimate_id, viewed_at'),
  ]);

  const archivedCount = (allEstimates ?? []).filter(e => e.archived_at).length;
  const estimates = (allEstimates ?? []).filter(e => showArchived ? !!e.archived_at : !e.archived_at);

  // Agrupar vistas por estimado: conteo + última fecha
  const viewsByEstimate = {};
  (views ?? []).forEach(v => {
    if (!viewsByEstimate[v.estimate_id]) {
      viewsByEstimate[v.estimate_id] = { count: 0, lastViewedAt: null };
    }
    viewsByEstimate[v.estimate_id].count += 1;
    if (!viewsByEstimate[v.estimate_id].lastViewedAt || new Date(v.viewed_at) > new Date(viewsByEstimate[v.estimate_id].lastViewedAt)) {
      viewsByEstimate[v.estimate_id].lastViewedAt = v.viewed_at;
    }
  });

  const rows = estimates.map(est => {
    const b = statusBadge[est.status] ?? statusBadge.draft;
    const viewInfo = viewsByEstimate[est.id];
    const viewLabel = viewInfo ? formatViewedAt(viewInfo.lastViewedAt, locale, t) : null;
    return {
      id: est.id,
      estimate_number: est.estimate_number,
      title: est.title,
      clientName: est.clients?.name ?? null,
      statusCls: b.cls,
      statusLabel: t(`status.${b.key}`),
      issued_at: est.issued_at,
      valid_until: est.valid_until,
      total: est.total,
      viewCount: viewInfo?.count ?? 0,
      viewLabel,
      viewTitle: viewInfo ? t('lastViewed', { date: viewLabel }) : null,
    };
  });

  const totalDraft = estimates?.filter(e => e.status === 'draft').reduce((a, e) => a + Number(e.total ?? 0), 0) ?? 0;
  const totalSent = estimates?.filter(e => e.status === 'sent').reduce((a, e) => a + Number(e.total ?? 0), 0) ?? 0;

  return (
    <div className="admin-shell ds-estimados">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {showArchived ? (
              <Link href="/estimados" className="btn btn-ghost">{t('viewActive')}</Link>
            ) : (
              <Link href="/estimados?archived=1" className="btn btn-ghost">{archivedCount ? t('viewArchivedCount', { count: archivedCount }) : t('viewArchived')}</Link>
            )}
            <Link href="/estimados/nueva" className="btn btn-primary">{t('newEstimate')}</Link>
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">{t('stats.total')}</div>
            <div className="stat-value">{estimates?.length ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.draft')}</div>
            <div className="stat-value" style={{ color: 'var(--muted)', fontSize: 22 }}>${totalDraft.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stats.sent')}</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 22 }}>${totalSent.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
        </div>

        <div className="card">
          {!estimates?.length ? (
            <div className="empty">
              <div className="empty-glyph">🧮</div>
              <h3>{showArchived ? t('empty.titleArchived') : t('empty.titleActive')}</h3>
              <p>{showArchived ? t('empty.textArchived') : t('empty.textActive')}</p>
              {!showArchived && <Link href="/estimados/nueva" className="btn btn-primary btn-sm">{t('empty.cta')}</Link>}
            </div>
          ) : (
            <EstimadosTableClient estimates={rows} />
          )}
        </div>
      </main>
    </div>
  );
}
