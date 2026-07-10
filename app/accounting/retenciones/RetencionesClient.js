
'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import NuevaRetencionForm from './NuevaRetencionForm';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';

export default function RetencionesClient({ retenciones: initial, clients, year }) {
  const [rets, setRets] = useState(initial);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function handleSaved(newRow) {
    setRets(prev => [newRow, ...prev]);
    setShowForm(false);
  }

  async function updateEstado(id, estado) {
    await supabase.from('retenciones').update({ estado }).eq('id', id);
    setRets(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
  }

  async function deleteRetencion(id) {
    if (!confirm('¿Eliminar esta retención?')) return;
    await supabase.from('retenciones').delete().eq('id', id);
    setRets(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      client_id: r.client_id ?? '',
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
      client_id: editData.client_id || null,
      fecha: editData.fecha,
      monto_facturado: parseFloat(editData.monto_facturado || 0),
      monto_exento: parseFloat(editData.monto_exento || 0),
      retencion_aplicada: parseFloat(editData.retencion_aplicada || 0),
      numero_comprobante: editData.numero_comprobante || null,
      estado: editData.estado,
      notas: editData.notas || null,
    };
    const { data } = await supabase.from('retenciones').update(payload).eq('id', id).select('*, clients(name)').single();
    setSaving(false);
    if (data) setRets(prev => prev.map(r => r.id === id ? data : r));
    setEditingId(null);
    setEditData(null);
  }

  const query = search.trim().toLowerCase();
  const visibleRets = query
    ? rets.filter(r => (r.clients?.name ?? '').toLowerCase().includes(query) || (r.numero_comprobante ?? '').toLowerCase().includes(query))
    : rets;

  return (
    <div>
      {/* Add button */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Registro de retenciones {year}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente o comprobante..." />
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Agregar retención'}</button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <NuevaRetencionForm clients={clients} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      {/* List */}
      <div className="card">
        {rets.length === 0 ? (
          <div className="empty"><p>No hay retenciones registradas para {year}.</p></div>
        ) : visibleRets.length === 0 ? (
          <div className="empty"><p>Sin resultados para "{search}".</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Facturado</th>
                  <th style={{ textAlign: 'right' }}>Exento</th>
                  <th style={{ textAlign: 'right' }}>Base</th>
                  <th style={{ textAlign: 'right' }}>Calculado (10%)</th>
                  <th style={{ textAlign: 'right' }}>Aplicado</th>
                  <th style={{ textAlign: 'right' }}>Diferencia</th>
                  <th># Comprobante</th>
                  <th>Estado</th>
                  <th>Factura</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRets.map(r => {
                  if (editingId === r.id) {
                    return (
                      <tr key={r.id}>
                        <td><input type="date" value={editData.fecha} onChange={e => setEditData(d => ({ ...d, fecha: e.target.value }))} style={{ width: 130, fontSize: 12 }} /></td>
                        <td>
                          <div style={{ width: 170 }}>
                            <ClientCombobox clients={clients} value={editData.client_id} onChange={v => setEditData(d => ({ ...d, client_id: v }))} />
                          </div>
                        </td>
                        <td><input type="number" value={editData.monto_facturado} onChange={e => setEditData(d => ({ ...d, monto_facturado: e.target.value }))} style={{ width: 90, fontSize: 12, textAlign: 'right' }} /></td>
                        <td><input type="number" value={editData.monto_exento} onChange={e => setEditData(d => ({ ...d, monto_exento: e.target.value }))} style={{ width: 80, fontSize: 12, textAlign: 'right' }} /></td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.base_retencion)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.retencion_calculada)}</td>
                        <td><input type="number" value={editData.retencion_aplicada} onChange={e => setEditData(d => ({ ...d, retencion_aplicada: e.target.value }))} style={{ width: 80, fontSize: 12, textAlign: 'right' }} /></td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.diferencia)}</td>
                        <td><input value={editData.numero_comprobante} onChange={e => setEditData(d => ({ ...d, numero_comprobante: e.target.value }))} style={{ width: 100, fontSize: 12 }} /></td>
                        <td>
                          <select value={editData.estado} onChange={e => setEditData(d => ({ ...d, estado: e.target.value }))} style={{ fontSize: 12 }}>
                            <option value="pendiente">Pendiente</option>
                            <option value="declarado">Declarado</option>
                          </select>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.invoice_id ? <Link href={`/facturas/${r.invoice_id}`}>Ver →</Link> : '—'}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>💾</button>
                          <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>✕</button>
                        </td>
                      </tr>
                    );
                  }
                  const diff = Number(r.diferencia ?? 0);
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.fecha}</td>
                      <td style={{ fontWeight: 600 }}>{r.clients?.name ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.monto_facturado)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.monto_exento)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(r.base_retencion)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.retencion_calculada)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>{fmt(r.retencion_aplicada)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: Math.abs(diff) > 0.01 ? 'var(--warn)' : 'var(--ok)' }}>
                        {Math.abs(diff) > 0.01 ? '⚠️ ' : '✓ '}{fmt(Math.abs(diff))}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.numero_comprobante ?? '—'}</td>
                      <td>
                        <select value={r.estado} onChange={e => updateEstado(r.id, e.target.value)}
                          style={{ padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}>
                          <option value="pendiente">Pendiente</option>
                          <option value="declarado">Declarado</option>
                        </select>
                      </td>
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
    </div>
  );
}
