'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const STATUS_BADGE = { pendiente: 'badge-gray', ordenado: 'badge-blue', recibido: 'badge-green', cancelado: 'badge-red' };
const STATUS_LABELS = { pendiente: 'Pendiente', ordenado: 'Ordenado', recibido: 'Recibido', cancelado: 'Cancelado' };
const SOURCE_LABELS = { proposal: 'Propuesta', job: 'Trabajo' };
const SOURCE_HREF = { proposal: id => `/propuestas/${id}`, job: id => `/trabajos/${id}` };

export default function CompraDetailClient({ order }) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const total = (order.purchase_order_items ?? []).reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);

  async function changeStatus(newStatus) {
    setSaving(true);
    const now = new Date().toISOString();
    const patch = { status: newStatus };
    if (newStatus === 'ordenado' && !order.ordered_at) patch.ordered_at = now;
    if (newStatus === 'recibido') patch.received_at = now;
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', order.id);
    setSaving(false);
    if (error) { alert('Error al cambiar el estado: ' + error.message); return; }
    setStatus(newStatus);
    router.refresh();
  }

  async function deleteOrder() {
    setDeleting(true);
    const { error } = await supabase.from('purchase_orders').delete().eq('id', order.id);
    if (error) {
      setDeleting(false);
      alert('No se pudo eliminar la orden: ' + error.message);
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
            {order.vendors?.name ?? 'Proveedor sin nombre'} ·{' '}
            <Link href={SOURCE_HREF[order.source_type]?.(order.source_id) ?? '#'} style={{ color: 'var(--navy)' }}>
              {SOURCE_LABELS[order.source_type] ?? order.source_type}: {order.source_label}
            </Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={`badge ${STATUS_BADGE[status] ?? 'badge-gray'}`}>{STATUS_LABELS[status] ?? status}</span>
          {status === 'pendiente' && (
            <button className="btn btn-primary" disabled={saving} onClick={() => changeStatus('ordenado')}>Marcar ordenado</button>
          )}
          {status === 'ordenado' && (
            <button className="btn btn-primary" disabled={saving} onClick={() => changeStatus('recibido')}>Marcar recibido</button>
          )}
          {['pendiente', 'ordenado'].includes(status) && (
            <button className="btn btn-ghost" disabled={saving} onClick={() => changeStatus('cancelado')}>Cancelar</button>
          )}
          <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5' }} onClick={() => setShowDelete(true)}>🗑</button>
        </div>
      </div>

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar orden de compra?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteOrder} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Proveedor</p>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{order.vendors?.name ?? '—'}</div>
        {order.vendors?.contact_name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{order.vendors.contact_name}</div>}
        {order.vendors?.email && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{order.vendors.email}</div>}
        {order.vendors?.phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{order.vendors.phone}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Descripción</th>
              <th style={{ textAlign: 'center', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cant.</th>
              <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Costo unit.</th>
              <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(order.purchase_order_items ?? []).map(it => (
              <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 20px', fontSize: 14, fontWeight: 600 }}>{it.description}</td>
                <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'center' }}>{it.quantity}</td>
                <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'right' }}>{fmt(it.unit_price)}</td>
                <td style={{ padding: '12px 20px', fontSize: 14, textAlign: 'right', fontWeight: 700 }}>{fmt((it.quantity || 0) * (it.unit_price || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: 'var(--navy)', borderTop: '1.5px solid var(--border)' }}>
          Total: {fmt(total)}
        </div>
      </div>
    </div>
  );
}
