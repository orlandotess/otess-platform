export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import RecurringInvoiceActions from './RecurringInvoiceActions';
import { getTranslations, getLocale } from 'next-intl/server';

export default async function FacturasRecurrentesPage() {
  const t = await getTranslations('facturas.recurringList');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';

  const { data: recurring } = await supabase
    .from('recurring_invoices')
    .select('*, clients(name, email), recurring_invoice_items(quantity, unit_price)')
    .order('created_at', { ascending: false });

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const freqLabels = { weekly: t('freq.weekly'), monthly: t('freq.monthly'), quarterly: t('freq.quarterly'), yearly: t('freq.yearly') };
  const dowLabels = [0, 1, 2, 3, 4, 5, 6].map(i => t(`dow.${i}`));

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{t('title')}</div>
          <Link href="/facturas/recurrentes/nueva" className="btn btn-primary">{t('newRecurring')}</Link>
        </div>

        {(recurring ?? []).length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            {t('empty')}
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {recurring.map((r, i) => {
              const total = (r.recurring_invoice_items ?? []).reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0);
              const cadence = r.frequency === 'weekly'
                ? t('cadenceWeekly', { day: dowLabels[r.day_of_week] ?? '' })
                : t('cadenceOther', { freq: freqLabels[r.frequency] ?? r.frequency, day: r.day_of_month });
              return (
                <Link key={r.id} href={`/facturas/recurrentes/${r.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < recurring.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{r.clients?.name ?? t('noClient')}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      {cadence} · {t('nextRun', { date: new Date(r.next_run_date + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }) })} · {fmt(total)}
                    </div>
                    {!r.clients?.email && (
                      <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 2 }}>{t('noEmailWarning')}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="badge" style={{ color: r.active ? 'var(--ok)' : 'var(--ink-faint)' }}>{r.active ? t('active') : t('paused')}</span>
                    <RecurringInvoiceActions id={r.id} active={r.active} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
