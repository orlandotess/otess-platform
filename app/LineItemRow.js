'use client';
import { useState } from 'react';

// Styled catalog search used in place of a native <input list>/<datalist>,
// which renders inconsistently across browsers and can't be themed.
// Keeps the same contract as before: typing calls onChange with raw text,
// picking a result calls onChange with "item_code — description" so the
// parent's existing `catalogItems.find(c => \`${c.item_code} — ${c.description}\` === value)`
// matching logic keeps working unchanged.
function CatalogDescriptionInput({ value, onChange, catalogOptions, placeholder, maxLength, fontSize = 13.5, fontWeight = 700 }) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const results = (q
    ? catalogOptions.filter(c => c.description?.toLowerCase().includes(q) || c.item_code?.toLowerCase().includes(q))
    : catalogOptions
  ).slice(0, 8);

  function select(c) {
    onChange(`${c.item_code} — ${c.description}`);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{ fontSize, fontWeight, width: '100%' }}
      />
      {open && catalogOptions.length > 0 && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--muted)' }}>Sin resultados de catálogo. Se usará el texto escrito.</p>
            ) : results.map(c => (
              <div key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => select(c)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.item_code}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                </div>
                {c.price != null && <div style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>${Number(c.price).toFixed(2)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Shared line-item row for Propuestas, Trabajos and Facturas: photo thumbnail,
// type + description, MSRP/Precio/Costo stacked, cantidad, subtotal, and a
// "⋮" menu holding the Exento toggle (kept out of the always-visible columns
// so the row stays as compact as Propuestas').
export default function LineItemRow({
  viewMode = false,
  isAccessory = false,
  type, onTypeChange,
  description, onDescriptionChange, catalogOptions = [], datalistId, catalogItemId,
  quantity, onQuantityChange,
  msrp, onMsrpChange,
  unitPrice, onUnitPriceChange,
  supplierPrice, onSupplierPriceChange,
  exempt, onExemptChange,
  discount, onDiscountChange,
  area, onAreaChange, areaOptions = [],
  vendor, onVendorChange, vendorOptions = [],
  photoUrl, onPhotoSelect, uploadingPhoto = false,
  fmt,
  actions,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const subtotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
  const matchedCatalogItem = catalogItemId ? catalogOptions.find(c => c.id === catalogItemId) : null;
  const stockHint = type === 'product' && matchedCatalogItem?.stock_quantity != null ? matchedCatalogItem.stock_quantity : null;
  const hasMsrp = !!onMsrpChange && type !== 'labor';
  const hasSupplierPrice = !!onSupplierPriceChange && type !== 'labor';
  const hasVendor = !!onVendorChange && type !== 'labor';
  const hasPhoto = !!onPhotoSelect || !!photoUrl;

  if (isAccessory) {
    return (
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, marginLeft: 32, alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
        <label style={{ cursor: viewMode ? 'default' : 'pointer', flexShrink: 0 }}>
          {photoUrl ? (
            <img src={photoUrl} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: 'var(--surface)' }} />
          ) : !viewMode ? (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--muted)' }}>
              {uploadingPhoto ? '...' : '📷'}
            </div>
          ) : null}
          {!viewMode && (
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPhotoSelect?.(e.target.files?.[0])} />
          )}
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          {viewMode ? (
            <div style={{ fontSize: 13 }}>{description}</div>
          ) : (
            <CatalogDescriptionInput value={description} onChange={onDescriptionChange} catalogOptions={catalogOptions}
              placeholder="Accesorio..." maxLength={200} fontSize={13} fontWeight={400} />
          )}
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
          {viewMode ? (
            <span style={{ fontSize: 13 }}>x{quantity}</span>
          ) : (
            <input type="number" value={quantity} onChange={e => onQuantityChange(e.target.value)} style={{ fontSize: 13, padding: '4px 6px', textAlign: 'center', width: '100%' }} min="0" step="0.01" />
          )}
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, position: 'relative' }}>
      {hasPhoto && (
        <label style={{ cursor: viewMode ? 'default' : 'pointer', flexShrink: 0 }}>
          {photoUrl ? (
            <img src={photoUrl} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-2)' }} />
          ) : !viewMode ? (
            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--muted)' }}>
              {uploadingPhoto ? '...' : '📷'}
            </div>
          ) : null}
          {!viewMode && (
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPhotoSelect?.(e.target.files?.[0])} />
          )}
        </label>
      )}

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
            <CatalogDescriptionInput value={description} onChange={onDescriptionChange} catalogOptions={catalogOptions}
              placeholder="Descripción o código..." maxLength={200} />
          </>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, width: 100 }}>
        {viewMode ? (
          <>
            {hasMsrp && (
              <div style={{ fontSize: 11, color: 'var(--muted)', textDecoration: msrp != null ? 'line-through' : 'none' }}>{msrp != null ? fmt(msrp) : '—'}</div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(unitPrice)}</div>
            {hasSupplierPrice && (
              <div style={{ fontSize: 11, color: 'var(--warn)' }}>{supplierPrice != null ? fmt(supplierPrice) : '—'}</div>
            )}
          </>
        ) : (
          <>
            {hasMsrp && (
              <input type="number" value={msrp} onChange={e => onMsrpChange(e.target.value)} placeholder="MSRP" style={{ fontSize: 11, padding: '3px 6px', color: 'var(--muted)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title="MSRP (referencia, solo interno)" />
            )}
            <input type="number" value={unitPrice} onChange={e => onUnitPriceChange(e.target.value)} placeholder="Precio venta" style={{ fontSize: 13, padding: '4px 6px', fontWeight: 700, border: '1.5px solid var(--amber)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title="Precio de venta al cliente" />
            {hasSupplierPrice && (
              <input type="number" value={supplierPrice} onChange={e => onSupplierPriceChange(e.target.value)} placeholder="Costo" style={{ fontSize: 11, padding: '3px 6px', color: 'var(--warn)', textAlign: 'right', width: '100%' }} min="0" step="0.01" title="Costo del suplidor (solo interno)" />
            )}
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
        {stockHint != null && (
          <div style={{ fontSize: 9, color: stockHint <= 0 ? 'var(--warn)' : 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap' }} title="Cantidad en inventario">Stock: {stockHint}</div>
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
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 180, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => { onExemptChange(!exempt); setMenuOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, color: 'var(--navy)' }}>
                    {exempt ? '☑ Exento de IVU' : '☐ Marcar exento de IVU'}
                  </button>
                  {onDiscountChange && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Descuento ($)</label>
                      <input type="number" value={discount} onChange={e => onDiscountChange(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                    </div>
                  )}
                  {onAreaChange && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Área</label>
                      <input list="line-item-area-options" value={area ?? ''} onChange={e => onAreaChange(e.target.value)} placeholder="Piso 1, Oficina 2..."
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                      <datalist id="line-item-area-options">
                        {areaOptions.map(a => <option key={a} value={a} />)}
                      </datalist>
                    </div>
                  )}
                  {hasVendor && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Suplidor</label>
                      <input list="line-item-vendor-options" value={vendor ?? ''} onChange={e => onVendorChange(e.target.value)} placeholder="Adi, Multi Electric..."
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                      <datalist id="line-item-vendor-options">
                        {vendorOptions.map(v => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  )}
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
