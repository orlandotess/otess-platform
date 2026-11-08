'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '../../../lib/supabase';
import { computeRetentionForInvoice } from '../../../lib/retenciones';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Las retenciones de UNA factura, dentro del modal del botón "Retención" en
// /facturas/[id]: verlas, corregirlas y borrarlas sin ir a Contabilidad.
//
// Reglas al borrar:
// - Una retención "declarado" ya se le informó a Hacienda: no se borra. Hay
//   que pasarla a "pendiente" a propósito (editando) antes de poder borrarla.
// - Los $500 de exención anual se consumen en orden (lib/retenciones.js). Si
//   el cliente tiene retenciones posteriores ese mismo año, borrar esta les
//   devuelve exención que no se recalcula sola — se avisa en la confirmación.
export default function RetencionesDeFactura({ retenciones, clientId, subtotalLabor, onChanged }) {
  const t = useTranslations('facturas.actions.retentionList');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [busy, setBusy] = useState(false);

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      fecha: r.fecha ?? '',
      monto_facturado: r.monto_facturado ?? '',
      monto_exento: r.monto_exento ?? '',
      retencion_aplicada: r.retencion_aplicada ?? '',
      numero_comprobante: r.numero_comprobante ?? '',
      estado: r.estado ?? 'pendiente',
    });
  }

  // Vuelve a sugerir la retención con el subtotal de labor que la factura tiene
  // HOY (p. ej. después de pasar su descuento a antes del IVU), sin contar la
  // exención que esta misma retención ya había tomado.
  async function recalcular(r) {
    const s = await computeRetentionForInvoice({
      clientId, subtotalLabor, fecha: editData.fecha || r.fecha, excludeRetencionId: r.id,
    });
    setEditData(d => ({
      ...d,
      monto_facturado: String(Number(subtotalLabor || 0)),
      monto_exento: String(Math.round(s.montoExento * 100) / 100),
      retencion_aplicada: String(Math.round(s.retencionCalculada * 100) / 100),
    }));
  }

  async function saveEdit(id) {
    setBusy(true);
    const payload = {
      fecha: editData.fecha,
      monto_facturado: parseFloat(editData.monto_facturado || 0),
      monto_exento: parseFloat(editData.monto_exento || 0),
      retencion_aplicada: parseFloat(editData.retencion_aplicada || 0),
      numero_comprobante: editData.numero_comprobante || null,
      estado: editData.estado,
    };
    const { data, error } = await supabase.from('retenciones').update(payload).eq('id', id).select('*').single();
    setBusy(false);
    if (error || !data) { alert(t('saveError')); return; }
    setEditingId(null);
    setEditData(null);
    onChanged(retenciones.map(r => (r.id === id ? data : r)));
  }

  async function remove(r) {
    if (r.estado === 'declarado') return;
    setBusy(true);
    let posteriores = 0;
    if (clientId && r.fecha) {
      const year = String(r.fecha).slice(0, 4);
      const { data } = await supabase.from('retenciones')
        .select('id, fecha, created_at')
        .eq('client_id', clientId)
        .gte('fecha', `${year}-01-01`)
        .lte('fecha', `${year}-12-31`);
      posteriores = (data ?? []).filter(o => o.id !== r.id && (
        o.fecha > r.fecha || (o.fecha === r.fecha && (o.created_at ?? '') > (r.created_at ?? ''))
      )).length;
    }
    setBusy(false);
    const msg = t('deleteConfirm', { amount: fmt(r.retencion_aplicada) })
      + (posteriores > 0 && Number(r.monto_exento) > 0
        ? '\n\n' + t('deleteExemptionWarning', { count: posteriores, exempt: fmt(r.monto_exento) })
        : '');
    if (!confirm(msg)) return;
    setBusy(true);
    // .select('id') para distinguir un borrado que la política bloqueó (0 filas,
    // sin error) de uno real — mismo criterio que /accounting/retenciones.
    const { data, error } = await supabase.from('retenciones').delete().eq('id', r.id).select('id');
    setBusy(false);
    if (error || !data?.length) { alert(t('deleteError')); return; }
    onChanged(retenciones.filter(x => x.id !== r.id));
  }

  const inp = { fontSize: 12, padding: '4px 6px' };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>{t('title')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {retenciones.map(r => {
          const declarada = r.estado === 'declarado';
          if (editingId === r.id) {
            return (
              <div key={r.id} style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('date')}
                    <input type="date" value={editData.fecha} onChange={e => setEditData(d => ({ ...d, fecha: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('billed')}
                    <input type="number" step="0.01" value={editData.monto_facturado} onChange={e => setEditData(d => ({ ...d, monto_facturado: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('exempt')}
                    <input type="number" step="0.01" value={editData.monto_exento} onChange={e => setEditData(d => ({ ...d, monto_exento: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('applied')}
                    <input type="number" step="0.01" value={editData.retencion_aplicada} onChange={e => setEditData(d => ({ ...d, retencion_aplicada: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('receipt')}
                    <input value={editData.numero_comprobante} onChange={e => setEditData(d => ({ ...d, numero_comprobante: e.target.value }))} style={{ ...inp, width: '100%' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t('status')}
                    <select value={editData.estado} onChange={e => setEditData(d => ({ ...d, estado: e.target.value }))} style={{ ...inp, width: '100%' }}>
                      <option value="pendiente">{t('pending')}</option>
                      <option value="declarado">{t('declared')}</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => saveEdit(r.id)} style={{ padding: '6px 14px', fontSize: 12 }}>💾 {t('save')}</button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => recalcular(r)} style={{ padding: '6px 14px', fontSize: 12 }}>↻ {t('recalculate', { amount: fmt(subtotalLabor) })}</button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setEditingId(null); setEditData(null); }} style={{ padding: '6px 14px', fontSize: 12 }}>{t('cancel')}</button>
                </div>
              </div>
            );
          }
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, color: 'var(--amber)' }}>{fmt(r.retencion_aplicada)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t('summary', { date: r.fecha ?? '—', billed: fmt(r.monto_facturado), exempt: fmt(r.monto_exento) })}
                  {r.numero_comprobante ? ` · ${t('receipt')}: ${r.numero_comprobante}` : ''}
                </div>
              </div>
              <span className={`badge ${declarada ? 'badge-green' : 'badge-gray'}`}>{declarada ? t('declared') : t('pending')}</span>
              <button type="button" onClick={() => startEdit(r)} disabled={busy} title={t('edit')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>✏️</button>
              <button type="button" onClick={() => remove(r)} disabled={busy || declarada}
                title={declarada ? t('declaredCantDelete') : t('delete')}
                style={{ background: 'none', border: 'none', cursor: declarada ? 'not-allowed' : 'pointer', fontSize: 15, opacity: declarada ? 0.35 : 1 }}>🗑</button>
            </div>
          );
        })}
      </div>
      {retenciones.some(r => r.estado === 'declarado') && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{t('declaredCantDelete')}</p>
      )}
    </div>
  );
}
