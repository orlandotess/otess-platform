'use client';
import { useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useTranslations } from 'next-intl';

export default function RecurringExpenseActions({ id, active, onToggled, onDeleted }) {
  const t = useTranslations('accounting.recurringExpenseActions');
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    const { data } = await supabase.from('recurring_expenses').update({ active: !active }).eq('id', id).select().single();
    setBusy(false);
    if (data) onToggled(data);
  }

  async function remove() {
    if (!confirm(t('confirmDelete'))) return;
    setBusy(true);
    await supabase.from('recurring_expenses').delete().eq('id', id);
    setBusy(false);
    onDeleted(id);
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-ghost" disabled={busy} onClick={toggleActive} style={{ fontSize: 12, padding: '6px 12px' }}>
        {active ? t('pause') : t('resume')}
      </button>
      <button className="btn btn-ghost" disabled={busy} onClick={remove} style={{ fontSize: 12, padding: '6px 12px', color: 'var(--warn)' }}>
        {t('delete')}
      </button>
    </div>
  );
}
