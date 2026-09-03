'use client';
import { useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import SearchBox from '../../SearchBox';
import NuevoGastoForm from './NuevoGastoForm';
import { useTranslations } from 'next-intl';

const expenseCategoryDefs = [
  { value: 'materiales', key: 'materiales' },
  { value: 'gasolina', key: 'gasolina' },
  { value: 'herramientas', key: 'herramientas' },
  { value: 'subcontratista', key: 'subcontratista' },
  { value: 'oficina', key: 'oficina' },
  { value: 'parking', key: 'parking' },
  { value: 'equipos', key: 'equipos' },
  { value: 'meals', key: 'meals' },
  { value: 'otro', key: 'otro' },
];

export default function GastosClient({ expenses: initial, jobs, periodLabel, categoryLabels }) {
  const t = useTranslations('accounting.gastosClient');
  const expenseCategories = useMemo(() => expenseCategoryDefs.map(c => ({ value: c.value, label: t(`expenseCategories.${c.key}`) })), [t]);
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // El recibo llega ya firmado desde el servidor (el bucket es privado). La
  // miniatura abre el original en otra pestaña; un gasto sin foto — o con una
  // ruta que ya no existe en storage — enseña el guion como el resto de las
  // columnas vacías.
  function receiptCell(r) {
    if (!r.receipt_thumb_url && !r.receipt_signed_url) {
      return <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>;
    }
    return (
      <a href={r.receipt_signed_url ?? r.receipt_thumb_url} target="_blank" rel="noreferrer" title={t('viewReceipt')}>
        <img src={r.receipt_thumb_url ?? r.receipt_signed_url} alt={t('receiptAlt')}
          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
      </a>
    );
  }

  function handleSaved(newRow) {
    setRows(prev => [newRow, ...prev]);
    setShowForm(false);
  }

  async function deleteExpense(id) {
    if (!confirm(t('confirmDelete'))) return;
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
    // El update trae la fila limpia de la base de datos, sin las URLs firmadas
    // que añadió el servidor, así que se reponen o la miniatura desaparecería
    // al guardar una edición.
    if (data) setRows(prev => prev.map(r => r.id === id
      ? { ...data, receipt_signed_url: r.receipt_signed_url, receipt_thumb_url: r.receipt_thumb_url }
      : r));
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
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{t('header', { period: periodLabel })}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? t('cancelButton') : t('addButton')}</button>
        </div>
      </div>

      {showForm && (
        <NuevoGastoForm jobs={jobs} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty"><p>{t('emptyForPeriod', { period: periodLabel })}</p></div>
        ) : visibleRows.length === 0 ? (
          <div className="empty"><p>{t('noResults', { search })}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('columns.date')}</th>
                  <th>{t('columns.category')}</th>
                  <th>{t('columns.description')}</th>
                  <th>{t('columns.vendor')}</th>
                  <th>{t('columns.job')}</th>
                  <th>{t('columns.receipt')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.amount')}</th>
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
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.jobs ? (r.jobs.job_number ?? r.jobs.title) : t('generalLabel')}</td>
                        <td>{receiptCell(r)}</td>
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
                        {r.job_id ? <Link href={`/trabajos/${r.job_id}`} style={{ color: 'var(--navy)', fontWeight: 600 }}>{r.jobs?.job_number ?? r.jobs?.title ?? t('viewJob')}</Link> : <span style={{ color: 'var(--muted)' }}>{t('generalLabel')}</span>}
                      </td>
                      <td>{receiptCell(r)}</td>
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
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--muted)' }}>
                    {query ? t('totalMatches', { count: visibleRows.length }) : t('total')}
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
