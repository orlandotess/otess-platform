'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import IVUInvoiceTableClient from '../ivu/IVUInvoiceTableClient';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Cliente360Client({ clientTotals, invoices, ivuByInvoice }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [retenciones, setRetenciones] = useState([]);
  const [loadingRetenciones, setLoadingRetenciones] = useState(false);

  const query = search.trim().toLowerCase();
  const visible = query
    ? clientTotals.filter(c => c.name.toLowerCase().includes(query) || (c.company ?? '').toLowerCase().includes(query))
    : clientTotals;

  async function selectClient(c) {
    setSelected(c);
    setLoadingRetenciones(true);
    const { data } = await supabase.from('retenciones').select('*').eq('client_id', c.id).order('fecha', { ascending: false });
    setRetenciones(data ?? []);
    setLoadingRetenciones(false);
  }

  const clientInvoices = selected ? invoices.filter(i => i.client_id === selected.id) : [];

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>Clientes</p>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente o empresa..." />
        </div>
        {clientTotals.length === 0 ? (
          <div className="empty"><p>No hay actividad de clientes todavía.</p></div>
        ) : visible.length === 0 ? (
          <div className="empty"><p>Sin resultados para "{search}".</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Facturas</th>
                  <th style={{ textAlign: 'right' }}>Facturado</th>
                  <th style={{ textAlign: 'right' }}>Cobrado</th>
                  <th style={{ textAlign: 'right' }}>IVU Labor</th>
                  <th style={{ textAlign: 'right' }}>IVU Producto</th>
                  <th style={{ textAlign: 'right' }}>Retenido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr key={c.id} onClick={() => selectClient(c)} style={{ cursor: 'pointer', background: selected?.id === c.id ? '#f0f4ff' : undefined }}>
                    <td style={{ fontWeight: 700 }}>{c.name}{c.company ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {c.company}</span> : ''}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.facturado)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--ok)' }}>{fmt(c.cobrado)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.ivuLabor)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.ivuProducto)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(c.retenido)}</td>
                    <td style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>{selected?.id === c.id ? 'Cerrar ↑' : 'Ver →'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Link href={`/clientes/${selected.id}`} className="btn btn-ghost">👤 Ver perfil de {selected.name} →</Link>
          </div>

          <IVUInvoiceTableClient invoices={clientInvoices} ivuByInvoice={ivuByInvoice} periodLabel={selected.name} />

          <div className="card" style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Historial de retenciones — {selected.name}</p>
            {loadingRetenciones ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
            ) : retenciones.length === 0 ? (
              <div className="empty"><p>Sin retenciones registradas.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th style={{ textAlign: 'right' }}>Facturado</th>
                      <th style={{ textAlign: 'right' }}>Exento</th>
                      <th style={{ textAlign: 'right' }}>Retenido</th>
                      <th># Comprobante</th>
                      <th>Estado</th>
                      <th>Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retenciones.map(r => (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.fecha}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.monto_facturado)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_exento)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(r.retencion_aplicada)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.numero_comprobante ?? '—'}</td>
                        <td><span className={`badge ${r.estado === 'declarado' ? 'badge-green' : 'badge-gray'}`}>{r.estado}</span></td>
                        <td style={{ fontSize: 12 }}>
                          {r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>Ver →</Link> : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
