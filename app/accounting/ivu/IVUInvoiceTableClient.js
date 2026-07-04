'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../../SearchBox';

export default function IVUInvoiceTableClient({ invoices, ivuByInvoice, periodLabel }) {
  const [search, setSearch] = useState('');
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const query = search.trim().toLowerCase();
  const visible = query
    ? invoices.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || (inv.clients?.name ?? '').toLowerCase().includes(query))
    : invoices;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>Detalle por factura{periodLabel ? ` — ${periodLabel}` : ''}</p>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar # factura o cliente..." />
      </div>
      {invoices.length === 0 ? (
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
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>IVU Prod (11.5%)</th>
                <th style={{ textAlign: 'right' }}>IVU Labor Final (11.5%)</th>
                <th style={{ textAlign: 'right' }}>IVU Labor B2B (4%)</th>
                <th style={{ textAlign: 'right' }}>Estatal (10.5%)</th>
                <th style={{ textAlign: 'right' }}>Municipal (1%)</th>
                <th style={{ textAlign: 'right' }}>Total IVU</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(inv => {
                const v = ivuByInvoice[inv.id] ?? { ivuProducts: 0, ivuLaborFinal: 0, ivuLaborB2B: 0 };
                const finalBase = v.ivuProducts + v.ivuLaborFinal;
                const estatal = finalBase * (10.5 / 11.5);
                const municipal = finalBase * (1 / 11.5);
                const total = finalBase + v.ivuLaborB2B;
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      <Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)' }}>{inv.invoice_number}</Link>
                    </td>
                    <td style={{ fontWeight: 600 }}>{inv.clients?.name ?? '—'}</td>
                    <td><span className={`badge ${inv.clients?.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>{inv.clients?.client_type === 'b2b' ? 'B2B' : 'Final'}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{inv.issued_at}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(v.ivuProducts)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(v.ivuLaborFinal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(v.ivuLaborB2B)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(estatal)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(municipal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(total)}</td>
                    <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Ver →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
