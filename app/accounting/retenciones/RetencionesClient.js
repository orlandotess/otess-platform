
'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

const estadoOpts = ['pendiente', 'declarado'];

export default function RetencionesClient({ retenciones: initial, clients, year }) {
  const [rets, setRets] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    monto_facturado: '',
    monto_exento: '500',
    retencion_aplicada: '',
    numero_comprobante: '',
    estado: 'pendiente',
    notas: '',
  });

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const baseRetencion = Math.max(Number(form.monto_facturado || 0) - Number(form.monto_exento || 0), 0);
  const retencionCalculada = baseRetencion * 0.10;
  const diferencia = retencionCalculada - Number(form.retencion_aplicada || 0);

  async function saveRetencion() {
    if (!form.fecha || !form.monto_facturado) return;
    setSaving(true);
    const { data } = await supabase.from('retenciones').insert([{
      client_id: form.client_id || null,
      fecha: form.fecha,
      monto_facturado: parseFloat(form.monto_facturado),
      monto_exento: parseFloat(form.monto_exento || 500),
      retencion_aplicada: parseFloat(form.retencion_aplicada || 0),
      numero_comprobante: form.numero_comprobante || null,
      estado: form.estado,
      notas: form.notas || null,
    }]).select('*, clients(name)').single();
    if (data) setRets(prev => [data, ...prev]);
    setForm({ client_id: '', fecha: new Date().toISOString().slice(0, 10), monto_facturado: '', monto_exento: '500', retencion_aplicada: '', numero_comprobante: '', estado: 'pendiente', notas: '' });
    setShowForm(false);
    setSaving(false);
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

  return (
    <div>
      {/* Add button */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Registro de retenciones {year}</p>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Agregar retención</button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Nueva retención</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Cliente</label>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">— Sin cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Monto facturado</label>
              <input type="number" value={form.monto_facturado} onChange={e => setForm(f => ({ ...f, monto_facturado: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Monto exento</label>
              <input type="number" value={form.monto_exento} onChange={e => setForm(f => ({ ...f, monto_exento: e.target.value }))} placeholder="500.00" />
            </div>
            <div className="form-group">
              <label>Retención aplicada</label>
              <input type="number" value={form.retencion_aplicada} onChange={e => setForm(f => ({ ...f, retencion_aplicada: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label># Comprobante (480.6B)</label>
              <input type="text" value={form.numero_comprobante} onChange={e => setForm(f => ({ ...f, numero_comprobante: e.target.value }))} placeholder="Número de comprobante" />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                <option value="pendiente">Pendiente declarar</option>
                <option value="declarado">Declarado</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notas</label>
              <input type="text" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..." />
            </div>
          </div>

          {/* Live calculation */}
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
            <button className="btn btn-primary" onClick={saveRetencion} disabled={saving}>
              {saving ? 'Guardando...' : '💾 Guardar'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="card">
        {rets.length === 0 ? (
          <div className="empty"><p>No hay retenciones registradas para {year}.</p></div>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rets.map(r => {
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
                      <td>
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
