'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { useTranslations } from 'next-intl';

export default function RecurringInvoiceActions({ id, active }) {
  const router = useRouter();
  const t = useTranslations('facturas.recurringActions');
  const [busy, setBusy] = useState(false);

  async function toggleActive(e) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    await supabase.from('recurring_invoices').update({ active: !active }).eq('id', id);
    setBusy(false);
    router.refresh();
  }

  async function remove(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t('confirmDelete'))) return;
    setBusy(true);
    await supabase.from('recurring_invoices').delete().eq('id', id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', gap: 8 }} onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
      <button className="btn btn-ghost" disabled={busy} onClick={toggleActive} style={{ fontSize: 12, padding: '6px 12px' }}>
        {active ? t('pause') : t('resume')}
      </button>
      <button className="btn btn-ghost" disabled={busy} onClick={remove} style={{ fontSize: 12, padding: '6px 12px', color: 'var(--warn)' }}>
        {t('delete')}
      </button>
    </div>
  );
}
