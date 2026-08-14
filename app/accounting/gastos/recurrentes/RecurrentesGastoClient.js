'use client';
import { useState, useMemo } from 'react';
import { supabase } from '../../../../lib/supabase';
import NuevoGastoRecurrenteForm from './NuevoGastoRecurrenteForm';
import RecurringExpenseActions from './RecurringExpenseActions';
import { useTranslations, useLocale } from 'next-intl';

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

export default function RecurrentesGastoClient({ recurring: initial, categoryLabels }) {
  const t = useTranslations('accounting.recurringExpensesClient');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  const expenseCategories = useMemo(() => expenseCategoryDefs.map(c => ({ value: c.value, label: t(`expenseCategories.${c.key}`) })), [t]);
  const freqLabels = useMemo(() => ({
    weekly: t('freq.weekly'),
    monthly: t('freq.monthly'),
    quarterly: t('freq.quarterly'),
    yearly: t('freq.yearly'),
  }), [t]);
  const dowLabels = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => t(`dow.${i}`)), [t]);

  function cadenceLabel(r) {
    return r.frequency === 'weekly'
      ? t('cadenceWeekly', { day: dowLabels[r.day_of_week] ?? '' })
      : t('cadenceOther', { freq: freqLabels[r.frequency] ?? r.frequency, day: r.day_of_month });
  }

  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });

  function handleSaved(newRow) {
    setRows(prev => [newRow, ...prev]);
    setShowForm(false);
  }

  function handleToggled(updated) {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  function handleDeleted(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditData({
      category: r.category,
      description: r.description,
      vendor: r.vendor ?? '',
      amount: r.amount,
      frequency: r.frequency,
      next_run_date: r.next_run_date,
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    const runDate = new Date(editData.next_run_date + 'T00:00:00');
    const payload = {
      category: editData.category,
      description: editData.description.trim(),
      vendor: editData.vendor.trim() || null,
      amount: parseFloat(editData.amount || 0),
      frequency: editData.frequency,
      day_of_month: editData.frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: editData.frequency === 'weekly' ? runDate.getDay() : null,
      next_run_date: editData.next_run_date,
    };
    const { data } = await supabase.from('recurring_expenses').update(payload).eq('id', id).select().single();
    setSaving(false);
    if (data) setRows(prev => prev.map(r => r.id === id ? data : r));
    setEditingId(null);
    setEditData(null);
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? t('cancelButton') : t('addButton')}</button>
      </div>

      {showForm && (
        <NuevoGastoRecurrenteForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      <div className="card" style={{ padding: rows.length === 0 ? undefined : 0 }}>
        {rows.length === 0 ? (
          <div className="empty"><p>{t('empty')}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('columns.category')}</th>
                  <th>{t('columns.description')}</th>
                  <th>{t('columns.vendor')}</th>
                  <th>{t('columns.frequency')}</th>
                  <th>{t('columns.next')}</th>
                  <th style={{ textAlign: 'right' }}>{t('columns.amount')}</th>
                  <th>{t('columns.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  if (editingId === r.id) {
                    return (
                      <tr key={r.id}>
                        <td>
                          <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} style={{ fontSize: 12 }}>
                            {expenseCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td><input value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} style={{ fontSize: 12, width: '100%' }} /></td>
                        <td><input value={editData.vendor} onChange={e => setEditData(d => ({ ...d, vendor: e.target.value }))} style={{ fontSize: 12, width: 100 }} /></td>
                        <td>
                          <select value={editData.frequency} onChange={e => setEditData(d => ({ ...d, frequency: e.target.value }))} style={{ fontSize: 12 }}>
                            <option value="weekly">{t('freq.weekly')}</option>
                            <option value="monthly">{t('freq.monthly')}</option>
                            <option value="quarterly">{t('freq.quarterly')}</option>
                            <option value="yearly">{t('freq.yearly')}</option>
                          </select>
                        </td>
                        <td><input type="date" value={editData.next_run_date} onChange={e => setEditData(d => ({ ...d, next_run_date: e.target.value }))} style={{ width: 130, fontSize: 12 }} /></td>
                        <td><input type="number" step="0.01" value={editData.amount} onChange={e => setEditData(d => ({ ...d, amount: e.target.value }))} style={{ width: 90, fontSize: 12, textAlign: 'right' }} /></td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.active ? t('active') : t('paused')}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>💾</button>
                          <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>✕</button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.id}>
                      <td><span className="badge badge-gray">{categoryLabels?.[r.category] ?? r.category}</span></td>
                      <td style={{ fontWeight: 600 }}>{r.description}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{r.vendor ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{cadenceLabel(r)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(r.next_run_date)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                      <td><span className="badge" style={{ color: r.active ? 'var(--ok)' : 'var(--ink-faint)' }}>{r.active ? t('active') : t('paused')}</span></td>
                      <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                        <RecurringExpenseActions id={r.id} active={r.active} onToggled={handleToggled} onDeleted={handleDeleted} />
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
