'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function RecurringInvoiceActions({ id, active }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    await supabase.from('recurring_invoices').update({ active: !active }).eq('id', id);
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm('¿Eliminar esta factura recurrente? Esta acción no se puede deshacer.')) return;
    setBusy(true);
    await supabase.from('recurring_invoices').delete().eq('id', id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
      <button className="btn btn-ghost" disabled={busy} onClick={toggleActive} style={{ fontSize: 12, padding: '6px 12px' }}>
        {active ? 'Pausar' : 'Reanudar'}
      </button>
      <button className="btn btn-ghost" disabled={busy} onClick={remove} style={{ fontSize: 12, padding: '6px 12px', color: '#c0392b' }}>
        Eliminar
      </button>
    </div>
  );
}
