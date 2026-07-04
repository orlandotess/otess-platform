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

export default function FacturasTableClient({ invs, totalFacturado }) {
  const [search, setSearch] = useState('');
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const query = search.trim().toLowerCase();
  const clientDisplay = inv => inv.bill_to === 'company' && inv.clients?.company ? inv.clients.company : inv.clients?.name ?? '—';
  const visible = query
    ? invs.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || clientDisplay(inv).toLowerCase().includes(query))
    : invs;

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
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'right' }}>IVU Prod</th>
                <th style={{ textAlign: 'right' }}>IVU Labor</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const b = statusBadge[inv.status] ?? statusBadge.draft;
                const subtotal = Number(inv.subtotal_products ?? 0) + Number(inv.subtotal_labor ?? 0);
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                    <td style={{ fontWeight: 600 }}>{clientDisplay(inv)}</td>
                    <td><span className={`badge ${inv.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>{inv.clients?.client_type === 'b2b' ? 'B2B' : 'Final'}</span></td>
                    <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at ?? '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(subtotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_products)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(inv.tax_labor)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total)}</td>
                    <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={5} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>TOTALES {query ? '(visibles)' : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(visible.reduce((a, i) => a + Number(i.subtotal_products ?? 0) + Number(i.subtotal_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(visible.reduce((a, i) => a + Number(i.tax_products ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(visible.reduce((a, i) => a + Number(i.tax_labor ?? 0), 0))}</td>
                <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(visible.reduce((a, i) => a + Number(i.total ?? 0), 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
