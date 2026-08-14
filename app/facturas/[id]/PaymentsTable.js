'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const fmtMoney = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentsTable({ payments, invoiceId, invoiceStatus, invoiceTotal, totalRetained }) {
  const router = useRouter();
  const t = useTranslations('facturas.paymentsTable');
  const methodLabel = { cash: t('method.cash'), check: t('method.check'), card: t('method.card'), transfer: t('method.transfer') };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  function openEdit(p) {
    setEditing(p);
    setForm({
      amount: p.amount,
      method: p.method,
      reference: p.reference ?? '',
      notes: p.notes ?? '',
      paid_at: p.paid_at,
    });
  }

  async function syncInvoiceStatus(newTotalPaid) {
    const balance = Number(invoiceTotal) - newTotalPaid - Number(totalRetained ?? 0);
    if (balance <= 0.01 && invoiceStatus !== 'paid') {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
    } else if (balance > 0.01 && invoiceStatus === 'paid') {
      await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    const amount = parseFloat(form.amount);
    await supabase.from('payments').update({
      amount,
      method: form.method,
      reference: form.reference || null,
      notes: form.notes || null,
      paid_at: form.paid_at,
    }).eq('id', editing.id);
    const newTotalPaid = payments.reduce((a, p) => a + (p.id === editing.id ? amount : Number(p.amount)), 0);
    await syncInvoiceStatus(newTotalPaid);
    setSaving(false);
    setEditing(null);
    router.refresh();
  }

  async function deletePayment(p) {
    if (!confirm(t('confirmDelete', { amount: fmtMoney(p.amount) }))) return;
    setDeletingId(p.id);
    await supabase.from('payments').delete().eq('id', p.id);
    const newTotalPaid = payments.filter(x => x.id !== p.id).reduce((a, x) => a + Number(x.amount), 0);
    await syncInvoiceStatus(newTotalPaid);
    setDeletingId(null);
    router.refresh();
  }

  if (!payments?.length) {
    return <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('empty')}</p>;
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>{t('columns.date')}</th>
            <th>{t('columns.method')}</th>
            <th>{t('columns.reference')}</th>
            <th>{t('columns.amount')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id}>
              <td>{p.paid_at}</td>
              <td><span className="badge badge-green">{methodLabel[p.method]}</span></td>
              <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.reference ?? '—'}</td>
              <td style={{ fontWeight: 700, color: 'var(--ok)' }}>{fmtMoney(p.amount)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => openEdit(p)}>✏️</button>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => deletePayment(p)} disabled={deletingId === p.id}>
                  {deletingId === p.id ? '⏳' : '🗑'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>{t('editTitle')}</h2>
            <form onSubmit={saveEdit}>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label>{t('amountLabel')}</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} step="0.01" min="0.01" required />
                </div>
                <div className="form-group">
                  <label>{t('dateLabel')}</label>
                  <input type="date" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>{t('methodLabel')}</label>
                <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                  {Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>{t('referenceLabel')}</label>
                <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('referencePlaceholder')} />
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>{t('notesLabel')}</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('notesPlaceholder')} style={{ minHeight: 60 }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? t('saving') : t('saveChanges')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
