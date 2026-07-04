export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import RecurringInvoiceActions from './RecurringInvoiceActions';

const FREQ_LABELS = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };
const DOW_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export default async function FacturasRecurrentesPage() {
  const { data: recurring } = await supabase
    .from('recurring_invoices')
    .select('*, clients(name, email), recurring_invoice_items(quantity, unit_price)')
    .order('created_at', { ascending: false });

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Facturas recurrentes</div>
          <Link href="/facturas/recurrentes/nueva" className="btn btn-primary">+ Nueva recurrencia</Link>
        </div>

        {(recurring ?? []).length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            No hay facturas recurrentes todavía.
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {recurring.map((r, i) => {
              const total = (r.recurring_invoice_items ?? []).reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0);
              const cadence = r.frequency === 'weekly'
                ? `Cada ${DOW_LABELS[r.day_of_week] ?? ''}`
                : `${FREQ_LABELS[r.frequency] ?? r.frequency} · día ${r.day_of_month}`;
              return (
                <Link key={r.id} href={`/facturas/recurrentes/${r.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < recurring.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{r.clients?.name ?? 'Sin cliente'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      {cadence} · Próximo envío: {new Date(r.next_run_date + 'T00:00:00').toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })} · {fmt(total)}
                    </div>
                    {!r.clients?.email && (
                      <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 2 }}>Cliente sin email — no se podrá enviar</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="badge" style={{ color: r.active ? '#27ae60' : '#888' }}>{r.active ? 'Activa' : 'Pausada'}</span>
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
