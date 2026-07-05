'use client';
import { useState } from 'react';

// Shared line-item row for Propuestas, Trabajos and Facturas: photo thumbnail,
// type + description, MSRP/Precio/Costo stacked, cantidad, subtotal, and a
// "⋮" menu holding the Exento toggle (kept out of the always-visible columns
// so the row stays as compact as Propuestas').
export default function LineItemRow({
  viewMode = false,
  type, onTypeChange,
  description, onDescriptionChange, catalogOptions = [], datalistId,
  quantity, onQuantityChange,
  msrp, onMsrpChange,
  unitPrice, onUnitPriceChange,
  supplierPrice, onSupplierPriceChange,
  exempt, onExemptChange,
  photoUrl, onPhotoSelect, uploadingPhoto = false,
  fmt,
  actions,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const subtotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 10, position: 'relative' }}>
      <label style={{ cursor: viewMode ? 'default' : 'pointer', flexShrink: 0 }}>
        {photoUrl ? (
          <img src={photoUrl} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, background: '#f4f6f9' }} />
        ) : !viewMode ? (
          <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--muted)' }}>
            {uploadingPhoto ? '...' : '📷'}
          </div>
        ) : null}
        {!viewMode && (
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPhotoSelect?.(e.target.files?.[0])} />
        )}
      </label>

      <div style={{ flex: 1, minWidth: 0 }}>
        {viewMode ? (
          <>
            <span className={`badge ${type === 'labor' ? 'badge-amber' : 'badge-gray'}`}>{type === 'labor' ? 'Labor' : 'Producto'}</span>
            {exempt && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Exento</span>}
            <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>{description}</div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <select value={type} onChange={e => onTypeChange(e.target.value)} style={{ fontSize: 11, padding: '3px 6px', width: 90 }}>
                <option value="labor">Labor</option>
                <option value="product">Producto</option>
              </select>
            </div>
            <input list={datalistId} value={description} onChange={e => onDescriptionChange(e.target.value)}
              placeholder="Descripción o código..." style={{ fontSize: 13.5, fontWeight: 700, width: '100%' }} />
            <datalist id={datalistId}>
              {catalogOptions.map(c => (
                <option key={c.id} value={`${c.item_code} — ${c.description}`} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, width: 100 }}>
        {viewMode ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--muted)', textDecoration: msrp != null ? 'line-through' : 'none' }}>{msrp != null ? fmt(msrp) : '—'}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(unitPrice)}</div>
            <div style={{ fontSize: 11, color: '#c0392b' }}>{supplierPrice != null ? fmt(supplierPrice) : '—'}</div>
          </>
        ) : (
          <>
            <input type="number" value={msrp} onChange={e => onMsrpChange(e.target.value)} placeholder="MSRP" style={{ fontSize: 11, padding: '3px 6px', color: 'var(--muted)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title="MSRP (referencia, solo interno)" />
            <input type="number" value={unitPrice} onChange={e => onUnitPriceChange(e.target.value)} placeholder="Precio venta" style={{ fontSize: 13, padding: '4px 6px', fontWeight: 700, border: '1.5px solid var(--amber)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title="Precio de venta al cliente" />
            <input type="number" value={supplierPrice} onChange={e => onSupplierPriceChange(e.target.value)} placeholder="Costo" style={{ fontSize: 11, padding: '3px 6px', color: '#c0392b', textAlign: 'right', width: '100%' }} min="0" step="0.01" title="Costo del suplidor (solo interno)" />
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', flexShrink: 0, width: 50 }}>
        <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Cant.</label>
        {viewMode ? (
          <div style={{ fontSize: 13 }}>{quantity}</div>
        ) : (
          <input type="number" value={quantity} onChange={e => onQuantityChange(e.target.value)} style={{ fontSize: 13, padding: '4px 6px', textAlign: 'center', width: '100%' }} min="0" step="0.01" />
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, width: 90 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>{fmt(subtotal)}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)' }}>Subtotal</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {!viewMode && (
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '2px 6px' }}>⋮</button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 180, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => { onExemptChange(!exempt); setMenuOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, color: 'var(--navy)' }}>
                    {exempt ? '☑ Exento de IVU' : '☐ Marcar exento de IVU'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
