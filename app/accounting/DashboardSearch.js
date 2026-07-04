'use client';
import { useState } from 'react';
import Link from 'next/link';

const statusBadge = { draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green', cancelled: 'badge-red' };

export default function DashboardSearch({ invoices }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const query = search.trim().toLowerCase();
  const results = query
    ? invoices.filter(inv => inv.invoice_number?.toLowerCase().includes(query) || (inv.clientName ?? '').toLowerCase().includes(query)).slice(0, 8)
    : [];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative', maxWidth: 260 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar factura o cliente..."
          style={{ padding: '8px 12px 8px 32px', fontSize: 13, width: '100%' }}
        />
      </div>
      {open && query && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, width: 320, maxHeight: 320, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>Sin resultados.</p>
            ) : (
              results.map(inv => (
                <Link key={inv.id} href={`/facturas/${inv.id}`} onClick={() => setOpen(false)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{inv.invoice_number}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.clientName ?? '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(inv.total)}</div>
                    <span className={`badge ${statusBadge[inv.status] ?? 'badge-gray'}`} style={{ fontSize: 10 }}>{inv.status}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
