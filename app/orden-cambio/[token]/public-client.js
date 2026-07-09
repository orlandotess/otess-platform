'use client';
import { useState } from 'react';

const NAVY = '#16223d';

export default function OrdenCambioPublicClient({ order, items }) {
  const [signedName, setSignedName] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(order.status === 'aprobada');
  const [error, setError] = useState('');

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const canApprove = !order.requires_signature || signedName.trim().length > 1;

  async function handleApprove() {
    if (!canApprove) return;
    setApproving(true); setError('');
    const res = await fetch('/api/ordenes-cambio/aprobar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: order.public_token, signed_name: order.requires_signature ? signedName.trim() : null }),
    });
    setApproving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Error al aprobar');
      return;
    }
    setApproved(true);
  }

  if (approved) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', fontFamily: '-apple-system,sans-serif', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #eee' }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#1a7a4a' }}>✓</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Orden de cambio aprobada</div>
          <p style={{ fontSize: 14, color: '#888' }}>Gracias — procederemos con el trabajo descrito.</p>
        </div>
      </div>
    );
  }

  const areas = Object.entries(
    (items ?? []).reduce((groups, it) => {
      const area = it.area || 'General';
      (groups[area] = groups[area] || []).push(it);
      return groups;
    }, {})
  );
  const lineTotal = it => (it.quantity || 0) * (it.unit_price || 0);
  const total = items.reduce((s, it) => s + lineTotal(it) + (it.tax_amount || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: '-apple-system,sans-serif' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eee', background: '#fff' }}>
        <img src="/otess-logo.png" alt="OTESS" style={{ height: 26 }} />
      </div>

      <div style={{ padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 600, letterSpacing: '0.03em' }}>{order.change_order_number} · ORDEN DE CAMBIO</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: NAVY, marginTop: 6, letterSpacing: '-0.3px' }}>{order.title}</div>
          <div style={{ fontSize: 14, color: '#999', marginTop: 4 }}>Para {order.clients?.name}</div>
        </div>

        {order.intro_note && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, border: '1px solid #eee' }}>
            <p style={{ fontSize: 14, margin: 0, color: '#444', lineHeight: 1.6 }}>{order.intro_note}</p>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, border: '1px solid #eee' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            {areas.map(([areaName, areaItems]) => {
              const areaTotal = areaItems.reduce((s, it) => s + lineTotal(it), 0);
              return (
                <div key={areaName}>
                  {areaName !== 'General' && <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{areaName}</div>}
                  <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, color: '#bbb', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
                    <span style={{ flex: 1 }}>Items</span>
                    <span style={{ width: 60, textAlign: 'right' }}>Precio</span>
                    <span style={{ width: 30, textAlign: 'center' }}>Cant</span>
                    <span style={{ width: 70, textAlign: 'right' }}>Total</span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {areaItems.map(it => (
                      <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {it.photo_signed_url ? <img src={it.photo_signed_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 13 }}>{it.type === 'product' ? '📦' : '🔧'}</span>}
                        </div>
                        <span style={{ fontSize: 12.5, color: '#555', flex: 1 }}>{it.description}</span>
                        <span style={{ width: 60, textAlign: 'right', fontSize: 12, color: '#999' }}>{fmt(it.unit_price)}</span>
                        <span style={{ width: 30, textAlign: 'center', fontSize: 12, color: '#999' }}>x{it.quantity}</span>
                        <span style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 600, color: NAVY }}>{fmt(lineTotal(it))}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0', fontSize: 12.5, fontWeight: 700, color: NAVY }}>
                    {areaName} Total: {fmt(areaTotal)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1.5px solid #ddd', fontWeight: 800, fontSize: 18, color: NAVY }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>

        {order.terms && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, border: '1px solid #eee' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Términos</p>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 }}>{order.terms}</p>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, padding: 24, border: '1px solid #eee' }}>
          {order.requires_signature && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Firma (escribe tu nombre completo)</label>
              <input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Nombre completo"
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, fontFamily: 'cursive', marginTop: 6 }} />
            </div>
          )}
          {error && <p style={{ color: '#b52a2a', fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <button onClick={handleApprove} disabled={!canApprove || approving}
            style={{ width: '100%', padding: 15, background: canApprove ? NAVY : '#ddd', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: canApprove ? 'pointer' : 'default' }}>
            {approving ? 'Procesando...' : 'Aprobar orden de cambio'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
