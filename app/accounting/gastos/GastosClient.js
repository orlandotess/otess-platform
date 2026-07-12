'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import NuevoGastoForm from './NuevoGastoForm';

const expenseCategories = [
  { value: 'materiales', label: 'Materiales' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'subcontratista', label: 'Subcontratista' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'parking', label: 'Parking' },
  { value: 'equipos', label: 'Equipos' },
  { value: 'meals', label: 'Meals' },
  { value: 'otro', label: 'Otro' },
];

export default function GastosClient({ expenses: initial, jobs, periodLabel, categoryLabels }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function handleSaved(newRow) {
    setRows(prev => [newRow, ...prev]);
    setShowForm(false);
  }

  async function deleteExpense(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      category: r.category,
      description: r.description,
      vendor: r.vendor ?? '',
      amount: r.amount,
      expense_date: r.expense_date,
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    const payload = {
      category: editData.category,
      description: editData.description.trim(),
      vendor: editData.vendor.trim() || null,
      amount: parseFloat(editData.amount || 0),
      expense_date: editData.expense_date,
    };
    const { data } = await supabase.from('expenses').update(payload).eq('id', id).select('*, jobs(title, job_number)').single();
    setSaving(false);
    if (data) setRows(prev => prev.map(r => r.id === id ? data : r));
    setEditingId(null);
    setEditData(null);
  }

  const query = search.trim().toLowerCase();
  const visibleRows = query
    ? rows.filter(r =>
        (r.description ?? '').toLowerCase().includes(query) ||
        (r.vendor ?? '').toLowerCase().includes(query) ||
        (r.jobs?.title ?? '').toLowerCase().includes(query) ||
        (r.jobs?.job_number ?? '').toLowerCase().includes(query))
    : rows;
  const visibleTotal = visibleRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Registro de gastos — {periodLabel}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar descripción, suplidor o trabajo..." />
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Agregar gasto'}</button>
        </div>
      </div>

      {showForm && (
        <NuevoGastoForm jobs={jobs} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty"><p>No hay gastos registrados para {periodLabel}.</p></div>
        ) : visibleRows.length === 0 ? (
          <div className="empty"><p>Sin resultados para "{search}".</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Suplidor</th>
                  <th>Trabajo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => {
                  if (editingId === r.id) {
                    return (
                      <tr key={r.id}>
                        <td><input type="date" value={editData.expense_date} onChange={e => setEditData(d => ({ ...d, expense_date: e.target.value }))} style={{ width: 130, fontSize: 12 }} /></td>
                        <td>
                          <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} style={{ fontSize: 12 }}>
                            {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td><input value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} style={{ fontSize: 12, width: '100%' }} /></td>
                        <td><input value={editData.vendor} onChange={e => setEditData(d => ({ ...d, vendor: e.target.value }))} style={{ fontSize: 12, width: 100 }} /></td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.jobs ? (r.jobs.job_number ?? r.jobs.title) : '— General —'}</td>
                        <td><input type="number" step="0.01" value={editData.amount} onChange={e => setEditData(d => ({ ...d, amount: e.target.value }))} style={{ width: 90, fontSize: 12, textAlign: 'right' }} /></td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>💾</button>
                          <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>✕</button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.expense_date}</td>
                      <td>
                        <span className="badge badge-gray">{categoryLabels?.[r.category] ?? r.category}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.description}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.vendor ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {r.job_id ? <Link href={`/trabajos/${r.job_id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>{r.jobs?.job_number ?? r.jobs?.title ?? 'Ver →'}</Link> : <span style={{ color: 'var(--muted)' }}>— General —</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                        <button onClick={() => deleteExpense(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--muted)' }}>
                    {query ? `Total (${visibleRows.length} coincidencia${visibleRows.length === 1 ? '' : 's'}):` : 'Total:'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(visibleTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
