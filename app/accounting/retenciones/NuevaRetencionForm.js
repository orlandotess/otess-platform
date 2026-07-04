'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { computeRetentionForInvoice } from '../../../lib/retenciones';
import SearchBox from '../../SearchBox';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shared "add retención" form.
// - Standalone/period mode: pass `clients`, user picks client then (optionally) an invoice.
// - Client-locked mode (by-client drill-down or invoice-detail shortcut): pass `clientIdLocked`/`clientNameLocked`,
//   and optionally `invoiceLocked` ({ id, invoice_number, subtotal_labor, issued_at }) to skip the invoice search too.
export default function NuevaRetencionForm({
  clients = [],
  clientIdLocked = null,
  clientNameLocked = '',
  invoiceLocked = null,
  onSaved,
  onCancel,
}) {
  const [clientId, setClientId] = useState(clientIdLocked || '');
  const [invoice, setInvoice] = useState(invoiceLocked || null);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [showInvoiceResults, setShowInvoiceResults] = useState(false);

  const [form, setForm] = useState({
    fecha: invoiceLocked?.issued_at || new Date().toISOString().slice(0, 10),
    monto_facturado: invoiceLocked ? String(invoiceLocked.subtotal_labor ?? '') : '',
    monto_exento: '500',
    retencion_aplicada: '',
    numero_comprobante: '',
    estado: 'pendiente',
    notas: '',
  });
  const [suggestion, setSuggestion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [touchedAplicada, setTouchedAplicada] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Fetch this client's invoices for the search box (only when not already locked to a single invoice).
  useEffect(() => {
    if (!clientId || invoiceLocked) return;
    supabase.from('invoices')
      .select('id, invoice_number, subtotal_labor, issued_at, status')
      .eq('client_id', clientId)
      .order('issued_at', { ascending: false })
      .then(({ data }) => setInvoiceOptions(data ?? []));
  }, [clientId, invoiceLocked]);

  // Live-compute the suggested exemption/retention whenever client, amount or date change.
  useEffect(() => {
    if (!clientId || !form.monto_facturado) { setSuggestion(null); return; }
    let cancelled = false;
    computeRetentionForInvoice({
      clientId,
      subtotalLabor: parseFloat(form.monto_facturado) || 0,
      fecha: form.fecha,
    }).then(s => {
      if (cancelled) return;
      setSuggestion(s);
      set('monto_exento', String(s.montoExento.toFixed(2)));
      if (!touchedAplicada) set('retencion_aplicada', s.retencionCalculada.toFixed(2));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, form.monto_facturado, form.fecha]);

  function selectInvoice(inv) {
    setInvoice(inv);
    set('fecha', inv.issued_at || form.fecha);
    set('monto_facturado', String(inv.subtotal_labor ?? ''));
    setInvoiceQuery('');
    setShowInvoiceResults(false);
  }

  function clearInvoice() {
    setInvoice(null);
    set('monto_facturado', '');
  }

  async function save() {
    if (!form.fecha || !form.monto_facturado) return;
    setSaving(true);
    const { data } = await supabase.from('retenciones').insert([{
      client_id: clientId || null,
      invoice_id: invoice?.id || null,
      fecha: form.fecha,
      monto_facturado: parseFloat(form.monto_facturado),
      monto_exento: parseFloat(form.monto_exento || 0),
      retencion_aplicada: parseFloat(form.retencion_aplicada || 0),
      numero_comprobante: form.numero_comprobante || null,
      estado: form.estado,
      notas: form.notas || null,
    }]).select('*, clients(name)').single();
    setSaving(false);
    if (data && onSaved) onSaved(data);
  }

  const filteredInvoices = invoiceQuery.trim()
    ? invoiceOptions.filter(i => i.invoice_number?.toLowerCase().includes(invoiceQuery.trim().toLowerCase()))
    : invoiceOptions;

  const baseRetencion = suggestion?.baseRetencion ?? Math.max(Number(form.monto_facturado || 0) - Number(form.monto_exento || 0), 0);
  const retencionCalculada = suggestion?.retencionCalculada ?? (baseRetencion * 0.10);
  const diferencia = retencionCalculada - Number(form.retencion_aplicada || 0);

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Nueva retención</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="form-group">
          <label>Cliente</label>
          {clientIdLocked ? (
            <input value={clientNameLocked} disabled />
          ) : (
            <select value={clientId} onChange={e => { setClientId(e.target.value); clearInvoice(); }}>
              <option value="">— Sin cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div className="form-group" style={{ position: 'relative' }}>
          <label>Factura (opcional — solo labor)</label>
          {invoiceLocked ? (
            <input value={invoiceLocked.invoice_number} disabled />
          ) : invoice ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={`${invoice.invoice_number} — ${fmt(invoice.subtotal_labor)} labor`} disabled style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={clearInvoice}>✕</button>
            </div>
          ) : (
            <>
              <SearchBox
                value={invoiceQuery}
                onChange={v => { setInvoiceQuery(v); setShowInvoiceResults(true); }}
                placeholder={clientId ? 'Buscar factura por número...' : 'Selecciona un cliente primero'}
                style={{ maxWidth: 'none' }}
              />
              {showInvoiceResults && clientId && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowInvoiceResults(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 11, maxHeight: 260, overflowY: 'auto' }}>
                    {filteredInvoices.length === 0 ? (
                      <p style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>Sin facturas.</p>
                    ) : filteredInvoices.map(inv => (
                      <div key={inv.id} onClick={() => selectInvoice(inv)}
                        style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{inv.invoice_number}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.issued_at}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(inv.subtotal_labor)} labor</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="form-group">
          <label>Fecha</label>
          <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Monto facturado (labor){invoice ? ' — de la factura' : ''}</label>
          <input type="number" value={form.monto_facturado} onChange={e => set('monto_facturado', e.target.value)} placeholder="0.00" disabled={!!invoice} />
        </div>
        <div className="form-group">
          <label>Monto exento</label>
          <input type="number" value={form.monto_exento} onChange={e => set('monto_exento', e.target.value)} placeholder="500.00" />
        </div>
        <div className="form-group">
          <label>Retención aplicada</label>
          <input type="number" value={form.retencion_aplicada} onChange={e => { setTouchedAplicada(true); set('retencion_aplicada', e.target.value); }} placeholder="0.00" />
        </div>
        <div className="form-group">
          <label># Comprobante (480.6B)</label>
          <input type="text" value={form.numero_comprobante} onChange={e => set('numero_comprobante', e.target.value)} placeholder="Número de comprobante" />
        </div>
        <div className="form-group">
          <label>Estado</label>
          <select value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="pendiente">Pendiente declarar</option>
            <option value="declarado">Declarado</option>
          </select>
        </div>
        <div className="form-group">
          <label>Notas</label>
          <input type="text" value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Opcional..." />
        </div>
      </div>

      {form.monto_facturado && (
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Base retención</div>
            <div style={{ fontWeight: 700 }}>{fmt(baseRetencion)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Retención calculada (10%)</div>
            <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(retencionCalculada)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Retención aplicada</div>
            <div style={{ fontWeight: 700, color: 'var(--amber)' }}>{fmt(form.retencion_aplicada || 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Diferencia</div>
            <div style={{ fontWeight: 700, color: diferencia > 0.01 ? 'var(--warn)' : 'var(--ok)' }}>
              {diferencia > 0.01 ? '⚠️ ' : '✓ '}{fmt(diferencia)}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
