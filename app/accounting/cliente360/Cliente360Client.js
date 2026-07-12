'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import IVUInvoiceTableClient from '../ivu/IVUInvoiceTableClient';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Cliente360Client({ clientTotals, invoices }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [retenciones, setRetenciones] = useState([]);
  const [loadingRetenciones, setLoadingRetenciones] = useState(false);
  const [retencionSearch, setRetencionSearch] = useState('');
  const detailRef = useRef(null);

  const query = search.trim().toLowerCase();
  const visible = query
    ? clientTotals.filter(c => c.name.toLowerCase().includes(query) || (c.company ?? '').toLowerCase().includes(query))
    : clientTotals;

  // The detail panel renders below a potentially long client list, so scroll
  // it into view — otherwise selecting a client can look like nothing happened.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  async function selectClient(c) {
    setSelected(c);
    setRetencionSearch('');
    setLoadingRetenciones(true);
    const { data } = await supabase.from('retenciones').select('*, invoices(invoice_number, total)').eq('client_id', c.id).order('fecha', { ascending: false });
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
                  <th style={{ textAlign: 'right' }}>Neto esperado</th>
                  <th style={{ textAlign: 'right' }}>IVU Labor</th>
                  <th style={{ textAlign: 'right' }}>IVU Producto</th>
                  <th style={{ textAlign: 'right' }}>Retenido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr key={c.id} onClick={() => selectClient(c)} style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--info-tint)' : undefined }}>
                    <td style={{ fontWeight: 700 }}>{c.name}{c.company ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {c.company}</span> : ''}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.facturado)}</td>
                    <td
                      style={{ textAlign: 'right', fontWeight: c.hasVarianza ? 700 : 400, color: c.hasVarianza ? 'var(--warn)' : 'var(--ok)' }}
                      title={c.hasVarianza ? `Difiere del neto esperado por ${fmt(Math.abs(c.varianza))}` : undefined}
                    >
                      {c.hasVarianza && '⚠️ '}{fmt(c.cobrado)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(c.netoEsperado)}</td>
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
        <div ref={detailRef}>
          <div style={{ marginBottom: 16 }}>
            <Link href={`/clientes/${selected.id}`} className="btn btn-ghost">👤 Ver perfil de {selected.name} →</Link>
          </div>

          {selected.hasVarianza && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warn)', background: 'var(--danger-tint)' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--warn)', marginBottom: 6 }}>⚠️ El cobrado no cuadra con el neto esperado</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Neto esperado (facturado pagado − retenido de esas facturas): <strong>{fmt(selected.netoEsperado)}</strong>
                {' · '}Cobrado: <strong>{fmt(selected.cobrado)}</strong>
                {' · '}Diferencia: <strong style={{ color: 'var(--warn)' }}>{fmt(Math.abs(selected.varianza))}</strong>
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Pide el comprobante 480.6B al cliente para confirmar la retención real antes de dar el pago por bueno.</p>
            </div>
          )}

          <IVUInvoiceTableClient invoices={clientInvoices} periodLabel={selected.name} hideClientColumn />

          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>Historial de retenciones — {selected.name}</p>
              {retenciones.length > 0 && (
                <SearchBox value={retencionSearch} onChange={setRetencionSearch} placeholder="Buscar # factura o comprobante..." />
              )}
            </div>
            {loadingRetenciones ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
            ) : retenciones.length === 0 ? (
              <div className="empty"><p>Sin retenciones registradas.</p></div>
            ) : (() => {
              const rq = retencionSearch.trim().toLowerCase();
              const visibleRets = rq
                ? retenciones.filter(r =>
                    (r.invoices?.invoice_number ?? '').toLowerCase().includes(rq) ||
                    (r.numero_comprobante ?? '').toLowerCase().includes(rq)
                  )
                : retenciones;
              if (visibleRets.length === 0) return <div className="empty"><p>Sin resultados para "{retencionSearch}".</p></div>;
              const totals = visibleRets.reduce((acc, r) => {
                const totalFactura = Number(r.invoices?.total ?? r.monto_facturado ?? 0);
                const retenido = Number(r.retencion_aplicada ?? 0);
                return {
                  totalFactura: acc.totalFactura + totalFactura,
                  baseLabor: acc.baseLabor + Number(r.monto_facturado ?? 0),
                  exento: acc.exento + Number(r.monto_exento ?? 0),
                  retenido: acc.retenido + retenido,
                  neto: acc.neto + (totalFactura - retenido),
                };
              }, { totalFactura: 0, baseLabor: 0, exento: 0, retenido: 0, neto: 0 });
              return (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Fecha</th>
                        <th style={{ textAlign: 'right' }}>Total factura</th>
                        <th style={{ textAlign: 'right' }}>Base labor</th>
                        <th style={{ textAlign: 'right' }}>Exento</th>
                        <th style={{ textAlign: 'right' }}>Retenido</th>
                        <th style={{ textAlign: 'right' }}>Neto</th>
                        <th># Comprobante</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRets.map(r => {
                        const totalFactura = Number(r.invoices?.total ?? r.monto_facturado ?? 0);
                        const retenido = Number(r.retencion_aplicada ?? 0);
                        return (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{r.invoices?.invoice_number ?? '—'}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.fecha}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalFactura)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_facturado)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_exento)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(retenido)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalFactura - retenido)}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.numero_comprobante ?? '—'}</td>
                            <td><span className={`badge ${r.estado === 'declarado' ? 'badge-green' : 'badge-gray'}`}>{r.estado}</span></td>
                            <td style={{ fontSize: 12 }}>
                              {r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>Ver →</Link> : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>TOTAL {retencionSearch ? '(visibles)' : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.totalFactura)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.baseLabor)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.exento)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.retenido)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.neto)}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
