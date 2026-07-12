'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import NuevaRetencionForm from './NuevaRetencionForm';

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RetencionesByClientClient({ clientTotals, exemptionYear }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // { id, name }
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const detailRef = useRef(null);

  const query = search.trim().toLowerCase();
  const visible = query
    ? clientTotals.filter(c => c.name.toLowerCase().includes(query))
    : clientTotals;

  const totals = visible.reduce((acc, c) => ({
    count: acc.count + Number(c.count ?? 0),
    facturado: acc.facturado + Number(c.totalFacturado ?? 0),
    calculado: acc.calculado + Number(c.totalCalculado ?? 0),
    retenido: acc.retenido + Number(c.totalRetenido ?? 0),
  }), { count: 0, facturado: 0, calculado: 0, retenido: 0 });

  // The detail panel renders below the client list, so scroll it into view —
  // otherwise selecting a client can look like the click did nothing.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  // Keep the selected client's totals/exemption in sync once router.refresh()
  // brings in recalculated clientTotals after a retención is added/edited/deleted.
  useEffect(() => {
    if (!selected) return;
    const fresh = clientTotals.find(c => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [clientTotals]);

  async function selectClient(c) {
    setSelected(c);
    setShowForm(false);
    setLoadingHistory(true);
    const { data } = await supabase.from('retenciones')
      .select('*')
      .eq('client_id', c.id)
      .order('fecha', { ascending: false });
    setHistory(data ?? []);
    setLoadingHistory(false);
  }

  function handleSaved(newRow) {
    setHistory(prev => [newRow, ...prev]);
    setShowForm(false);
    router.refresh();
  }

  async function deleteRetencion(id) {
    if (!confirm('¿Eliminar esta retención?')) return;
    await supabase.from('retenciones').delete().eq('id', id);
    setHistory(prev => prev.filter(r => r.id !== id));
    router.refresh();
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      fecha: r.fecha,
      monto_facturado: r.monto_facturado,
      monto_exento: r.monto_exento,
      retencion_aplicada: r.retencion_aplicada,
      numero_comprobante: r.numero_comprobante ?? '',
      estado: r.estado,
      notas: r.notas ?? '',
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    const payload = {
      fecha: editData.fecha,
      monto_facturado: parseFloat(editData.monto_facturado || 0),
      monto_exento: parseFloat(editData.monto_exento || 0),
      retencion_aplicada: parseFloat(editData.retencion_aplicada || 0),
      numero_comprobante: editData.numero_comprobante || null,
      estado: editData.estado,
      notas: editData.notas || null,
    };
    const { data } = await supabase.from('retenciones').update(payload).eq('id', id).select('*').single();
    setSaving(false);
    if (data) setHistory(prev => prev.map(r => r.id === id ? data : r));
    setEditingId(null);
    setEditData(null);
    router.refresh();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Retenciones por cliente</p>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente..." />
        </div>
        {clientTotals.length === 0 ? (
          <div className="empty"><p>No hay retenciones registradas todavía.</p></div>
        ) : visible.length === 0 ? (
          <div className="empty"><p>Sin resultados para "{search}".</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Transacciones</th>
                  <th style={{ textAlign: 'right' }}>Total facturado</th>
                  <th style={{ textAlign: 'right' }}>Total calculado</th>
                  <th style={{ textAlign: 'right' }}>Total retenido</th>
                  <th>Exención {exemptionYear}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr key={c.id} onClick={() => selectClient(c)}
                    style={{ cursor: 'pointer', background: selected?.id === c.id ? '#f0f4ff' : undefined }}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.totalFacturado)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.totalCalculado)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(c.totalRetenido)}</td>
                    <td>
                      {c.exemption?.exhausted ? (
                        <span className="badge badge-red">Agotada</span>
                      ) : c.exemption?.usedExemption > 0 ? (
                        <span className="badge badge-amber">{fmt(c.exemption.remainingExemption)} disponible</span>
                      ) : (
                        <span className="badge badge-green">$500.00 disponible</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>{selected?.id === c.id ? 'Cerrar ↑' : 'Ver →'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', paddingTop: 12 }}>TOTAL {query ? '(visibles)' : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12, color: 'var(--muted)' }}>{totals.count}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.facturado)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>{fmt(totals.calculado)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: 'var(--navy)', paddingTop: 12 }}>{fmt(totals.retenido)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="card" ref={detailRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{selected.name}</p>
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancelar' : '+ Registrar retención'}
            </button>
          </div>

          {selected.exemption && (
            <div style={{
              background: selected.exemption.exhausted ? 'var(--danger-tint)' : 'var(--ok-tint)',
              border: `1.5px solid ${selected.exemption.exhausted ? '#f3b7b7' : '#a9dcc4'}`,
              borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
                Exención {exemptionYear}: {fmt(selected.exemption.usedExemption)} de $500.00 usados
              </div>
              {selected.exemption.exhausted ? (
                <div style={{ color: 'var(--muted)' }}>
                  Exención agotada
                  {selected.exemption.exhaustedInvoice ? <> en <strong>{selected.exemption.exhaustedInvoice}</strong></> : null}
                  {selected.exemption.exhaustedDate ? ` (${selected.exemption.exhaustedDate})` : ''}
                  . A partir de ahora se retiene 10% sobre toda la labor facturada.
                </div>
              ) : (
                <div style={{ color: 'var(--muted)' }}>
                  Quedan <strong>{fmt(selected.exemption.remainingExemption)}</strong> exentos — la próxima factura no tendrá retención hasta superar ese monto en labor; lo que exceda se retiene al 10%.
                </div>
              )}
            </div>
          )}

          {showForm && (
            <NuevaRetencionForm
              clientIdLocked={selected.id}
              clientNameLocked={selected.name}
              onSaved={handleSaved}
              onCancel={() => setShowForm(false)}
            />
          )}

          {loadingHistory ? (
            <p style={{ color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>Cargando...</p>
          ) : history.length === 0 ? (
            <div className="empty"><p>Sin retenciones registradas para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Facturado</th>
                    <th style={{ textAlign: 'right' }}>Exento</th>
                    <th style={{ textAlign: 'right' }}>Base</th>
                    <th style={{ textAlign: 'right' }}>Calculado</th>
                    <th style={{ textAlign: 'right' }}>Aplicado</th>
                    <th># Comprobante</th>
                    <th>Estado</th>
                    <th>Factura</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(r => {
                    if (editingId === r.id) {
                      return (
                        <tr key={r.id}>
                          <td><input type="date" value={editData.fecha} onChange={e => setEditData(d => ({ ...d, fecha: e.target.value }))} style={{ width: 130, fontSize: 12 }} /></td>
                          <td><input type="number" value={editData.monto_facturado} onChange={e => setEditData(d => ({ ...d, monto_facturado: e.target.value }))} style={{ width: 90, fontSize: 12, textAlign: 'right' }} /></td>
                          <td><input type="number" value={editData.monto_exento} onChange={e => setEditData(d => ({ ...d, monto_exento: e.target.value }))} style={{ width: 80, fontSize: 12, textAlign: 'right' }} /></td>
                          <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.base_retencion)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.retencion_calculada)}</td>
                          <td><input type="number" value={editData.retencion_aplicada} onChange={e => setEditData(d => ({ ...d, retencion_aplicada: e.target.value }))} style={{ width: 80, fontSize: 12, textAlign: 'right' }} /></td>
                          <td><input value={editData.numero_comprobante} onChange={e => setEditData(d => ({ ...d, numero_comprobante: e.target.value }))} style={{ width: 100, fontSize: 12 }} /></td>
                          <td>
                            <select value={editData.estado} onChange={e => setEditData(d => ({ ...d, estado: e.target.value }))} style={{ fontSize: 12 }}>
                              <option value="pendiente">Pendiente</option>
                              <option value="declarado">Declarado</option>
                            </select>
                          </td>
                          <td style={{ fontSize: 12 }}>{r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`}>Ver →</Link> : '—'}</td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => saveEdit(r.id)} disabled={saving} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>💾</button>
                            <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>✕</button>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.fecha}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.monto_facturado)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_exento)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.base_retencion)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.retencion_calculada)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>{fmt(r.retencion_aplicada)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.numero_comprobante ?? '—'}</td>
                        <td><span className={`badge ${r.estado === 'declarado' ? 'badge-green' : 'badge-gray'}`}>{r.estado}</span></td>
                        <td style={{ fontSize: 12 }}>
                          {r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>Ver →</Link> : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                          <button onClick={() => deleteRetencion(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
