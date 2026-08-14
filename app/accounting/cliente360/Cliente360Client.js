'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import IVUInvoiceTableClient from '../ivu/IVUInvoiceTableClient';
import { useTranslations } from 'next-intl';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Cliente360Client({ clientTotals, invoices }) {
  const t = useTranslations('accounting.cliente360Client');
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

  const retencionQuery = retencionSearch.trim().toLowerCase();
  const visibleRetenciones = retencionQuery
    ? retenciones.filter(r =>
        (r.invoices?.invoice_number ?? '').toLowerCase().includes(retencionQuery) ||
        (r.numero_comprobante ?? '').toLowerCase().includes(retencionQuery) ||
        (r.fecha ?? '').toLowerCase().includes(retencionQuery)
      )
    : retenciones;

  function exportRetencionesCSV() {
    const headers = [
      t('retentionsColumns.invoice'), t('retentionsColumns.date'), t('retentionsColumns.totalInvoice'),
      t('retentionsColumns.laborBase'), t('retentionsColumns.exempt'), t('retentionsColumns.withheld'),
      t('retentionsColumns.net'), t('retentionsColumns.receiptNumber'), t('retentionsColumns.status'),
    ];
    const rows = visibleRetenciones.map(r => {
      const totalFactura = Number(r.invoices?.total ?? r.monto_facturado ?? 0);
      const retenido = Number(r.retencion_aplicada ?? 0);
      return [
        r.invoices?.invoice_number ?? t('notAvailable'),
        r.fecha ?? '',
        totalFactura.toFixed(2),
        Number(r.monto_facturado ?? 0).toFixed(2),
        Number(r.monto_exento ?? 0).toFixed(2),
        retenido.toFixed(2),
        (totalFactura - retenido).toFixed(2),
        r.numero_comprobante ?? '',
        r.estado ?? '',
      ];
    });
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = selected.name.replace(/[^a-z0-9]+/gi, '_');
    link.download = `Retenciones_${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{t('clientsTitle')}</p>
          <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        {clientTotals.length === 0 ? (
          <div className="empty"><p>{t('empty')}</p></div>
        ) : visible.length === 0 ? (
          <div className="empty"><p>{t('noResults', { search })}</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>{t('columns.client')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.invoices')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.billed')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.collected')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.expectedNet')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.ivuLabor')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.ivuProduct')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.withheld')}</th>
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
                      title={c.hasVarianza ? t('varianceTitle', { amount: fmt(Math.abs(c.varianza)) }) : undefined}
                    >
                      {c.hasVarianza && '⚠️ '}{fmt(c.cobrado)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(c.netoEsperado)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.ivuLabor)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.ivuProducto)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(c.retenido)}</td>
                    <td style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>{selected?.id === c.id ? t('close') : t('view')}</td>
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
            <Link href={`/clientes/${selected.id}`} className="btn btn-ghost">{t('viewProfileLink', { name: selected.name })}</Link>
          </div>

          {selected.hasVarianza && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warn)', background: 'var(--danger-tint)' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--warn)', marginBottom: 6 }}>{t('varianceWarningTitle')}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {t('varianceExpectedLabel')} <strong>{fmt(selected.netoEsperado)}</strong>
                {' · '}{t('varianceCollectedLabel')} <strong>{fmt(selected.cobrado)}</strong>
                {' · '}{t('varianceDiffLabel')} <strong style={{ color: 'var(--warn)' }}>{fmt(Math.abs(selected.varianza))}</strong>
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{t('varianceHint')}</p>
            </div>
          )}

          <IVUInvoiceTableClient invoices={clientInvoices} periodLabel={selected.name} hideClientColumn />

          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{t('retentionsHistoryTitle', { name: selected.name })}</p>
              {retenciones.length > 0 && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <SearchBox value={retencionSearch} onChange={setRetencionSearch} placeholder={t('retentionsSearchPlaceholder')} />
                  <button
                    onClick={exportRetencionesCSV}
                    disabled={visibleRetenciones.length === 0}
                    className="btn btn-ghost"
                    style={{ padding: '6px 14px', fontSize: 13 }}
                  >
                    {t('exportCSV')}
                  </button>
                </div>
              )}
            </div>
            {loadingRetenciones ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>{t('loading')}</p>
            ) : retenciones.length === 0 ? (
              <div className="empty"><p>{t('noRetentions')}</p></div>
            ) : (() => {
              const visibleRets = visibleRetenciones;
              if (visibleRets.length === 0) return <div className="empty"><p>{t('noResults', { search: retencionSearch })}</p></div>;
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
                  <table className="table-dense">
                    <thead>
                      <tr>
                        <th>{t('retentionsColumns.invoice')}</th>
                        <th>{t('retentionsColumns.date')}</th>
                        <th style={{ textAlign: 'right' }}>{t('retentionsColumns.totalInvoice')}</th>
                        <th style={{ textAlign: 'right' }}>{t('retentionsColumns.laborBase')}</th>
                        <th style={{ textAlign: 'right' }}>{t('retentionsColumns.exempt')}</th>
                        <th style={{ textAlign: 'right' }}>{t('retentionsColumns.withheld')}</th>
                        <th style={{ textAlign: 'right' }}>{t('retentionsColumns.net')}</th>
                        <th>{t('retentionsColumns.receiptNumber')}</th>
                        <th>{t('retentionsColumns.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRets.map(r => {
                        const totalFactura = Number(r.invoices?.total ?? r.monto_facturado ?? 0);
                        const retenido = Number(r.retencion_aplicada ?? 0);
                        return (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                              {r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`} style={{ color: 'inherit' }}>{r.invoices?.invoice_number ?? t('notAvailable')}</Link> : (r.invoices?.invoice_number ?? t('notAvailable'))}
                            </td>
                            <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.fecha}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalFactura)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_facturado)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_exento)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(retenido)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalFactura - retenido)}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.numero_comprobante ?? t('notAvailable')}</td>
                            <td><span className={`badge ${r.estado === 'declarado' ? 'badge-green' : 'badge-gray'}`}>{r.estado}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>{retencionSearch ? t('retentionsTotalVisible') : t('retentionsTotal')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.totalFactura)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.baseLabor)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.exento)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.retenido)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.neto)}</td>
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
