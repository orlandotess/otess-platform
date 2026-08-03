'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../../SearchBox';

const statusBadge = {
  draft:     { cls: 'badge-gray',  label: 'Borrador' },
  sent:      { cls: 'badge-blue',  label: 'Enviada' },
  paid:      { cls: 'badge-green', label: 'Pagada' },
  cancelled: { cls: 'badge-red',   label: 'Cancelada' },
};

export default function FacturasTableClient({ invs, totalFacturado, collectedByInvoice = {}, retenidoByInvoice = {} }) {
  const [search, setSearch] = useState('');
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv => inv.status === 'sent' && inv.due_at && inv.due_at < today;

  const query = search.trim().toLowerCase();
  const clientDisplay = inv => inv.bill_to === 'company' && inv.clients?.company ? inv.clients.company : inv.clients?.name ?? '—';
  const cobrado = inv => collectedByInvoice[inv.id] ?? 0;
  const retenido = inv => retenidoByInvoice[inv.id] ?? 0;
  // Retención (10% labor withholding, see Retenciones) is money remitted to
  // Hacienda on the client's behalf, not an unpaid balance — netted out
  // alongside cash collected before anything counts as still owed. A draft
  // hasn't been sent to the client yet (and cancelled never will be), so
  // neither is a real debt — matches the same status filter used for the
  // Pendiente/Vencido stat cards in page.js, else the two disagree.
  const pendiente = inv => (inv.status === 'draft' || inv.status === 'cancelled')
    ? 0
    : Math.max(Number(inv.total ?? 0) - cobrado(inv) - retenido(inv), 0);
  const visible = query
    ? invs.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || clientDisplay(inv).toLowerCase().includes(query))
    : invs;
  // Footer totals exclude draft/cancelled so they match the Facturado/
  // Cobrado/Retenido/Pendiente stat cards above (same basis as page.js) —
  // rows still list every invoice, including drafts, for pipeline visibility.
  const counted = visible.filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled');
  const hasExcluded = visible.length !== counted.length;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar # factura o cliente..." />
      </div>
      {invs.length === 0 ? (
        <div className="empty"><p>No hay facturas para este período.</p></div>
      ) : visible.length === 0 ? (
        <div className="empty"><p>Sin resultados para "{search}".</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table-dense">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Vence</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'right' }}>IVU Prod</th>
                <th style={{ textAlign: 'right' }}>IVU Labor</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Cobrado</th>
                <th style={{ textAlign: 'right' }}>Retención</th>
                <th style={{ textAlign: 'right' }}>Pendiente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const overdue = isOverdue(inv);
                const b = overdue ? { cls: 'badge-red', label: 'Vencida' } : (statusBadge[inv.status] ?? statusBadge.draft);
                const subtotal = Number(inv.subtotal_products ?? 0) + Number(inv.subtotal_labor ?? 0);
                const pend = pendiente(inv);
                const ret = retenido(inv);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                    <td style={{ fontWeight: 600 }}>{clientDisplay(inv)}</td>
                    <td><span className={`badge ${inv.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>{inv.clients?.client_type === 'b2b' ? 'B2B' : 'Final'}</span></td>
                    <td>
                      <span className={`badge ${b.cls}`}>{b.label}</span>
                      {overdue && inv.reminders_paused_at && (
                        <span className="badge badge-gray" style={{ marginLeft: 4 }} title="Recordatorios pausados">⏸</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                    <td style={{ color: overdue ? 'var(--warn)' : 'var(--muted)', fontSize: 13, fontWeight: overdue ? 700 : 400 }}>{inv.due_at ?? '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(subtotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_products)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_labor)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ok)' }}>{fmt(cobrado(inv))}</td>
                    <td style={{ textAlign: 'right', color: ret > 0 ? 'var(--navy)' : 'var(--muted)' }}>{fmt(ret)}</td>
                    <td style={{ textAlign: 'right', fontWeight: pend > 0 ? 700 : 400, color: pend > 0 ? 'var(--amber)' : 'var(--muted)' }}>{fmt(pend)}</td>
                    <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={6} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>TOTALES {query ? '(visibles)' : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.subtotal_products ?? 0) + Number(i.subtotal_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.tax_products ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(counted.reduce((a, i) => a + Number(i.total ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, color: 'var(--ok)' }}>{fmt(counted.reduce((a, i) => a + cobrado(i), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, color: 'var(--navy)' }}>{fmt(counted.reduce((a, i) => a + retenido(i), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, paddingTop: 12, color: 'var(--amber)' }}>{fmt(counted.reduce((a, i) => a + pendiente(i), 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          {hasExcluded && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Los totales excluyen facturas en borrador o canceladas ({visible.length - counted.length} de {visible.length}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
