'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { useTranslations } from 'next-intl';

const STATUS_BADGE = { pendiente: 'badge-gray', ordenado: 'badge-blue', recibido: 'badge-green', cancelado: 'badge-red' };
const SOURCE_HREF = { proposal: id => `/propuestas/${id}`, job: id => `/trabajos/${id}`, change_order: id => `/ordenes-cambio/${id}` };

export default function CompraDetailClient({ order }) {
  const t = useTranslations('compras.detailClient');
  const STATUS_LABELS = { pendiente: t('status.pendiente'), ordenado: t('status.ordenado'), recibido: t('status.recibido'), cancelado: t('status.cancelado') };
  const SOURCE_LABELS = { proposal: t('source.proposal'), job: t('source.job'), change_order: t('source.changeOrder') };
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState(order.purchase_order_items ?? []);
  const [savingItems, setSavingItems] = useState(false);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const items = editing ? editItems : (order.purchase_order_items ?? []);
  const total = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);

  function startEditing() {
    setEditItems((order.purchase_order_items ?? []).map(it => ({ ...it })));
    setEditing(true);
  }

  function updateEditItem(id, field, value) {
    setEditItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  }

  function removeEditItem(id) {
    setEditItems(prev => prev.filter(it => it.id !== id));
  }

  async function saveItems() {
    setSavingItems(true);
    try {
      const keptIds = editItems.map(it => it.id);
      const removedIds = (order.purchase_order_items ?? []).map(it => it.id).filter(id => !keptIds.includes(id));
      if (removedIds.length) {
        const { error: delErr } = await supabase.from('purchase_order_items').delete().in('id', removedIds);
        if (delErr) throw delErr;
      }
      for (const it of editItems) {
        const { error: updErr } = await supabase.from('purchase_order_items').update({
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        }).eq('id', it.id);
        if (updErr) throw updErr;
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(t('errorSavingChanges', { message: err.message }));
    } finally {
      setSavingItems(false);
    }
  }

  async function changeStatus(newStatus) {
    setSaving(true);
    const now = new Date().toISOString();
    const patch = { status: newStatus };
    if (newStatus === 'ordenado' && !order.ordered_at) patch.ordered_at = now;
    if (newStatus === 'recibido') patch.received_at = now;
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', order.id);
    setSaving(false);
    if (error) { alert(t('errorChangingStatus', { message: error.message })); return; }
    setStatus(newStatus);
    router.refresh();
  }

  async function deleteOrder() {
    setDeleting(true);
    const { error } = await supabase.from('purchase_orders').delete().eq('id', order.id);
    if (error) {
      setDeleting(false);
      alert(t('errorDeleting', { message: error.message }));
      return;
    }
    router.push('/compras');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{order.order_number}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {order.vendors?.name ?? t('noVendorName')} ·{' '}
            <Link href={SOURCE_HREF[order.source_type]?.(order.source_id) ?? '#'} style={{ color: 'var(--navy)' }}>
              {SOURCE_LABELS[order.source_type] ?? order.source_type}: {order.source_label}
            </Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={`badge ${STATUS_BADGE[status] ?? 'badge-gray'}`}>{STATUS_LABELS[status] ?? status}</span>
          {status === 'pendiente' && (
            <button className="btn btn-primary" disabled={saving} onClick={() => changeStatus('ordenado')}>{t('markOrdered')}</button>
          )}
          {status === 'ordenado' && (
            <button className="btn btn-primary" disabled={saving} onClick={() => changeStatus('recibido')}>{t('markReceived')}</button>
          )}
          {['pendiente', 'ordenado'].includes(status) && (
            <button className="btn btn-ghost" disabled={saving} onClick={() => changeStatus('cancelado')}>{t('cancel')}</button>
          )}
          {status === 'pendiente' && !editing && (
            <button className="btn btn-ghost" onClick={startEditing}>✏️ {t('edit')}</button>
          )}
          <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => setShowDelete(true)}>🗑</button>
        </div>
      </div>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>{t('deleteConfirmTitle')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>{t('deleteConfirmBody')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteOrder} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? t('deleting') : `🗑 ${t('deleteConfirmYes')}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{t('vendorSectionTitle')}</p>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{order.vendors?.name ?? '—'}</div>
        {order.vendors?.contact_name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{order.vendors.contact_name}</div>}
        {order.vendors?.email && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{order.vendors.email}</div>}
        {order.vendors?.phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{order.vendors.phone}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('table.description')}</th>
              <th style={{ textAlign: 'center', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('table.qty')}</th>
              <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('table.unitCost')}</th>
              <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('table.total')}</th>
              {editing && <th style={{ padding: '12px 20px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {editing ? (
                  <>
                    <td style={{ padding: '8px 20px' }}>
                      <input className="input" value={it.description} onChange={e => updateEditItem(it.id, 'description', e.target.value)} style={{ width: '100%' }} />
                    </td>
                    <td style={{ padding: '8px 20px', textAlign: 'center' }}>
                      <input className="input" type="number" value={it.quantity} onChange={e => updateEditItem(it.id, 'quantity', e.target.value)} style={{ width: 70, textAlign: 'center' }} />
                    </td>
                    <td style={{ padding: '8px 20px', textAlign: 'right' }}>
                      <input className="input" type="number" step="0.01" value={it.unit_price} onChange={e => updateEditItem(it.id, 'unit_price', e.target.value)} style={{ width: 90, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '8px 20px', textAlign: 'right', fontWeight: 700 }}>{fmt((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                    <td style={{ padding: '8px 20px', textAlign: 'center' }}>
                      <button type="button" className="btn btn-ghost" style={{ color: 'var(--warn)', padding: '2px 8px' }} onClick={() => removeEditItem(it.id)}>🗑</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{it.description}</td>
                    <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'center' }}>{it.quantity}</td>
                    <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'right' }}>{fmt(it.unit_price)}</td>
                    <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'right', fontWeight: 700 }}>{fmt((it.quantity || 0) * (it.unit_price || 0))}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid var(--border)' }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" disabled={savingItems} onClick={saveItems}>{savingItems ? t('saving') : t('saveChanges')}</button>
              <button className="btn btn-ghost" disabled={savingItems} onClick={() => setEditing(false)}>{t('cancel')}</button>
            </div>
          ) : <div />}
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>{t('totalLabel', { amount: fmt(total) })}</div>
        </div>
      </div>
    </div>
  );
}
