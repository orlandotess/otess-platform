'use client';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { matchesCatalogQuery, CATALOG_RESULT_LIMIT } from '../lib/catalogSearch';
import { displayTitle } from '../lib/lineItemTitle';

// Styled catalog search used in place of a native <input list>/<datalist>,
// which renders inconsistently across browsers and can't be themed.
// Keeps the same contract as before: typing calls onChange with raw text,
// picking a result calls onChange with "item_code — description" so the
// parent's existing `catalogItems.find(c => \`${c.item_code} — ${c.description}\` === value)`
// matching logic keeps working unchanged.
export function CatalogDescriptionInput({ value, onChange, catalogOptions, placeholder, maxLength, fontSize = 13.5, fontWeight = 700, multiline = false }) {
  const t = useTranslations('shared.lineItemRow');
  const [open, setOpen] = useState(false);
  const matches = catalogOptions.filter(c => matchesCatalogQuery(c, value));
  const results = matches.slice(0, CATALOG_RESULT_LIMIT);

  function select(c) {
    onChange(`${c.item_code} — ${c.description}`);
    setOpen(false);
  }

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div style={{ position: 'relative' }}>
      <Field
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={multiline ? 3 : undefined}
        style={{ fontSize, fontWeight, width: '100%', ...(multiline ? { resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, minHeight: 60 } : {}) }}
      />
      {open && catalogOptions.length > 0 && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: 260, overflowY: 'auto' }}>
            {results.length === 0 ? (
              <p style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--muted)' }}>{t('catalogInput.noResults')}</p>
            ) : results.map(c => (
              <div key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => select(c)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.name || c.item_code}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name && c.name !== c.item_code && `${c.item_code} — `}{c.description}</div>
                </div>
                {c.price != null && <div style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>${Number(c.price).toFixed(2)}</div>}
              </div>
            ))}
            {matches.length > results.length && (
              <p style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>
                {t('catalogInput.moreResults', { shown: results.length, total: matches.length })}
              </p>
            )}
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
  showPricing = false,
  alwaysShowPricing = false,
  type, onTypeChange,
  title, onTitleChange,
  description, onDescriptionChange, catalogOptions = [], datalistId, catalogItemId,
  quantity, onQuantityChange,
  msrp, onMsrpChange,
  unitPrice, onUnitPriceChange,
  supplierPrice, onSupplierPriceChange,
  exempt, onExemptChange,
  saveToCatalog, onSaveToCatalogChange,
  discount, onDiscountChange,
  area, onAreaChange, areaOptions = [],
  vendor, onVendorChange, vendorOptions = [],
  warrantyExpiresAt, onWarrantyExpiresAtChange,
  photoUrl, onPhotoSelect, uploadingPhoto = false,
  fmt,
  actions,
}) {
  const t = useTranslations('shared.lineItemRow');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-PR';
  // Only affects the read-only render; editing still shows the raw title field.
  const shownTitle = displayTitle(title, description);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMargin, setShowMargin] = useState(false);
  const [marginPct, setMarginPct] = useState('');

  // Single source of truth for Costo + Margen % -> Precio venta, called from
  // both the Costo and Margen % inputs so recompute never depends on effect
  // ordering (previously the Costo input only recomputed via a useEffect
  // keyed on [supplierPrice], which silently missed the case where Margen %
  // was set first and Costo edited/finished afterward).
  function recomputeFromMargin(cost, pct) {
    const c = parseFloat(cost);
    const p = parseFloat(pct);
    if (!isNaN(c) && c > 0 && !isNaN(p)) {
      onUnitPriceChange((c * (1 + p / 100)).toFixed(2));
    }
  }

  function handleSupplierPriceChange(v) {
    onSupplierPriceChange(v);
    if (showMargin) recomputeFromMargin(v, marginPct);
  }

  function handleMarginPctChange(v) {
    setMarginPct(v);
    recomputeFromMargin(supplierPrice, v);
  }

  function openMargin() {
    const cost = parseFloat(supplierPrice);
    const price = parseFloat(unitPrice);
    if (!isNaN(cost) && cost > 0 && !isNaN(price)) {
      setMarginPct((((price / cost) - 1) * 100).toFixed(1));
    }
    setShowMargin(true);
  }

  const subtotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
  const matchedCatalogItem = catalogItemId ? catalogOptions.find(c => c.id === catalogItemId) : null;
  const stockHint = type === 'product' && matchedCatalogItem?.stock_quantity != null ? matchedCatalogItem.stock_quantity : null;
  const hasMsrp = !!onMsrpChange && type !== 'labor';
  const hasSupplierPrice = !!onSupplierPriceChange && type !== 'labor';
  const hasVendor = !!onVendorChange && type !== 'labor';
  const hasWarranty = !!onWarrantyExpiresAtChange && type !== 'labor';
  const hasPhoto = !!onPhotoSelect || !!photoUrl;

  let warrantyStatus = null;
  if (warrantyExpiresAt) {
    const daysLeft = Math.ceil((new Date(`${warrantyExpiresAt}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
    warrantyStatus = daysLeft < 0 ? 'expired' : daysLeft <= 60 ? 'soon' : 'ok';
  }
  function setWarrantyMonths(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    onWarrantyExpiresAtChange(d.toISOString().slice(0, 10));
  }

  if (isAccessory) {
    const accessorySubtotal = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
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
          {matchedCatalogItem && (vendor || matchedCatalogItem.item_code) && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
              {vendor || matchedCatalogItem.vendor}{(vendor || matchedCatalogItem.vendor) && matchedCatalogItem.item_code ? '  ·  ' : ''}{matchedCatalogItem.item_code}
            </div>
          )}
          {viewMode ? (
            <div style={{ fontSize: 13 }}>{description}</div>
          ) : (
            <CatalogDescriptionInput value={description} onChange={onDescriptionChange} catalogOptions={catalogOptions}
              placeholder={t('accessoryPlaceholder')} maxLength={200} fontSize={13} fontWeight={400} />
          )}
        </div>
        {(showPricing || alwaysShowPricing) && (
          <div style={{ textAlign: 'right', flexShrink: 0, width: 95 }}>
            {viewMode ? (
              <>
                {onMsrpChange && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: msrp != null && msrp !== '' ? 'line-through' : 'none' }}>{msrp != null && msrp !== '' ? fmt(msrp) : '—'}</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(unitPrice)}</div>
                {onSupplierPriceChange && <div style={{ fontSize: 10, color: 'var(--warn)' }}>{supplierPrice != null && supplierPrice !== '' ? fmt(supplierPrice) : '—'}</div>}
              </>
            ) : (
              <>
                {onMsrpChange && (
                  <input type="number" value={msrp} onChange={e => onMsrpChange(e.target.value)} placeholder={t('msrpPlaceholder')} title={t('msrpTitle')}
                    style={{ fontSize: 10.5, padding: '3px 6px', color: 'var(--muted)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" />
                )}
                <input type="number" value={unitPrice} onChange={e => onUnitPriceChange(e.target.value)} placeholder={t('pricePlaceholder')} title={showPricing ? t('priceTitleShowPricing') : t('priceTitleReference')}
                  style={{ fontSize: 12, padding: '4px 6px', fontWeight: 700, border: '1.5px solid var(--amber)', textAlign: 'right', width: '100%', marginBottom: onSupplierPriceChange ? 3 : 0 }} min="0" step="0.01" />
                {onSupplierPriceChange && (
                  <>
                    <input type="number" value={supplierPrice} onChange={e => handleSupplierPriceChange(e.target.value)} placeholder={t('costPlaceholder')} title={t('costTitle')}
                      style={{ fontSize: 10.5, padding: '3px 6px', color: 'var(--warn)', textAlign: 'right', width: '100%' }} min="0" step="0.01" />
                    {!showMargin ? (
                      (parseFloat(supplierPrice) > 0) ? (
                        <button type="button" onClick={openMargin} style={{ display: 'block', marginLeft: 'auto', marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 9.5, padding: 0, textDecoration: 'underline' }} title={t('addMarginTitle')}>
                          {t('addMargin')}
                        </button>
                      ) : (
                        <div style={{ textAlign: 'right', marginTop: 3, fontSize: 9, color: 'var(--muted)' }} title={t('addMarginNeedsCostTitle')}>
                          {t('addMarginNeedsCost')}
                        </div>
                      )
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                        <input
                          type="number"
                          value={marginPct}
                          onChange={e => handleMarginPctChange(e.target.value)}
                          placeholder="30"
                          style={{ fontSize: 10, padding: '3px 4px', textAlign: 'right', width: '100%' }}
                          min="0" step="1"
                          title={t('marginPctTitle')}
                        />
                        <span style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>%</span>
                        <button type="button" onClick={() => { setShowMargin(false); setMarginPct(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, padding: 0, flexShrink: 0 }} title={t('closeMarginTitle')}>
                          ✕
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
          {viewMode ? (
            <span style={{ fontSize: 13 }}>x{quantity}</span>
          ) : (
            <input type="number" value={quantity} onChange={e => onQuantityChange(e.target.value)} style={{ fontSize: 13, padding: '4px 6px', textAlign: 'center', width: '100%' }} min="0" step="0.01" />
          )}
        </div>
        {(showPricing || alwaysShowPricing) && (
          <div style={{ textAlign: 'right', flexShrink: 0, width: 70 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--navy)' }}>{fmt(accessorySubtotal)}</div>
          </div>
        )}
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
            <span className={`badge ${type === 'labor' ? 'badge-amber' : type === 'fee' ? 'badge-dark' : 'badge-gray'}`}>{type === 'labor' ? t('type.labor') : type === 'fee' ? t('type.fee') : t('type.product')}</span>
            {exempt && <span className="badge badge-gray" style={{ marginLeft: 6 }}>{t('exempt')}</span>}
            {warrantyStatus && (
              <span
                title={t('warrantyExpiresTooltip', { date: new Date(`${warrantyExpiresAt}T00:00:00`).toLocaleDateString(dateLocale) })}
                style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: warrantyStatus === 'expired' ? 'var(--warn-tint, #fee2e2)' : warrantyStatus === 'soon' ? 'var(--amber-tint, #fef3c7)' : 'var(--surface-2)',
                  color: warrantyStatus === 'expired' ? 'var(--warn, #b91c1c)' : warrantyStatus === 'soon' ? 'var(--amber, #b45309)' : 'var(--muted)',
                }}
              >
                🛡️ {warrantyStatus === 'expired' ? t('warrantyExpired') : t('warranty')} {new Date(`${warrantyExpiresAt}T00:00:00`).toLocaleDateString(dateLocale)}
              </span>
            )}
            {shownTitle && <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>{shownTitle}</div>}
            {description && <div style={{ fontWeight: shownTitle ? 400 : 700, fontSize: 13.5, marginTop: shownTitle ? 2 : 4, whiteSpace: 'pre-wrap' }}>{description}</div>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <select value={type} onChange={e => onTypeChange(e.target.value)} style={{ fontSize: 11, padding: '3px 6px', width: 90 }}>
                <option value="labor">{t('type.labor')}</option>
                <option value="product">{t('type.product')}</option>
                <option value="fee">{t('type.fee')}</option>
              </select>
            </div>
            {onTitleChange && (
              <div style={{ marginBottom: 4 }}>
                <CatalogDescriptionInput value={title ?? ''} onChange={onTitleChange} catalogOptions={catalogOptions}
                  placeholder={t('titlePlaceholder')} maxLength={150} fontSize={13.5} fontWeight={700} />
              </div>
            )}
            <CatalogDescriptionInput value={description} onChange={onDescriptionChange} catalogOptions={catalogOptions}
              placeholder={t('descriptionPlaceholder')} maxLength={2000} fontWeight={onTitleChange ? 400 : 700}
              multiline={!!onTitleChange} />
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
              <input type="number" value={msrp} onChange={e => onMsrpChange(e.target.value)} placeholder={t('msrpPlaceholder')} style={{ fontSize: 11, padding: '3px 6px', color: 'var(--muted)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title={t('msrpTitle')} />
            )}
            <input type="number" value={unitPrice} onChange={e => onUnitPriceChange(e.target.value)} placeholder={t('pricePlaceholderVenta')} style={{ fontSize: 13, padding: '4px 6px', fontWeight: 700, border: '1.5px solid var(--amber)', textAlign: 'right', width: '100%', marginBottom: 3 }} min="0" step="0.01" title={t('priceTitleVenta')} />
            {hasSupplierPrice && (
              <>
                <input type="number" value={supplierPrice} onChange={e => handleSupplierPriceChange(e.target.value)} placeholder={t('costPlaceholder')} style={{ fontSize: 11, padding: '3px 6px', color: 'var(--warn)', textAlign: 'right', width: '100%' }} min="0" step="0.01" title={t('costTitle')} />
                {!showMargin ? (
                  (parseFloat(supplierPrice) > 0) ? (
                    <button type="button" onClick={openMargin} style={{ display: 'block', marginLeft: 'auto', marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 10, padding: 0, textDecoration: 'underline' }} title={t('addMarginTitle')}>
                      {t('addMargin')}
                    </button>
                  ) : (
                    <div style={{ textAlign: 'right', marginTop: 3, fontSize: 9.5, color: 'var(--muted)' }} title={t('addMarginNeedsCostTitle')}>
                      {t('addMarginNeedsCost')}
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                    <input
                      type="number"
                      value={marginPct}
                      onChange={e => handleMarginPctChange(e.target.value)}
                      placeholder="30"
                      style={{ fontSize: 11, padding: '3px 4px', textAlign: 'right', width: '100%' }}
                      min="0" step="1"
                      title={t('marginPctTitle')}
                    />
                    <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>%</span>
                    <button type="button" onClick={() => { setShowMargin(false); setMarginPct(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: 0, flexShrink: 0 }} title={t('closeMarginTitle')}>
                      ✕
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', flexShrink: 0, width: 50 }}>
        <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{t('quantityLabel')}</label>
        {viewMode ? (
          <div style={{ fontSize: 13 }}>{quantity}</div>
        ) : (
          <input type="number" value={quantity} onChange={e => onQuantityChange(e.target.value)} style={{ fontSize: 13, padding: '4px 6px', textAlign: 'center', width: '100%' }} min="0" step="0.01" />
        )}
        {stockHint != null && (
          <div style={{ fontSize: 9, color: stockHint <= 0 ? 'var(--warn)' : 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap' }} title={t('stockHintTitle')}>{t('stockHint', { count: stockHint })}</div>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, width: 90 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>{fmt(subtotal)}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{t('subtotalLabel')}</div>
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
                    {exempt ? `☑ ${t('exemptToggleLabel')}` : `☐ ${t('exemptToggleOffLabel')}`}
                  </button>
                  {onSaveToCatalogChange && !catalogItemId && (type === 'labor' || type === 'product') && (
                    <button type="button" onClick={() => { onSaveToCatalogChange(!saveToCatalog); setMenuOpen(false); }}
                      title={t('saveToCatalogTitle')}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, color: 'var(--navy)' }}>
                      {saveToCatalog ? `☑ ${t('saveToCatalogLabel')}` : `☐ ${t('saveToCatalogLabel')}`}
                    </button>
                  )}
                  {onDiscountChange && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('discountLabel')}</label>
                      <input type="number" value={discount} onChange={e => onDiscountChange(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                    </div>
                  )}
                  {onAreaChange && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('areaLabel')}</label>
                      <input list="line-item-area-options" value={area ?? ''} onChange={e => onAreaChange(e.target.value)} placeholder={t('areaPlaceholder')}
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                      <datalist id="line-item-area-options">
                        {areaOptions.map(a => <option key={a} value={a} />)}
                      </datalist>
                    </div>
                  )}
                  {hasVendor && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('vendorLabel')}</label>
                      <input list="line-item-vendor-options" value={vendor ?? ''} onChange={e => onVendorChange(e.target.value)} placeholder={t('vendorPlaceholder')}
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
                      <datalist id="line-item-vendor-options">
                        {vendorOptions.map(v => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  )}
                  {hasWarranty && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('warrantyExpiresLabel')}</label>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[12, 24, 36, 60].map(m => (
                          <button key={m} type="button" onClick={e => { e.stopPropagation(); setWarrantyMonths(m); }}
                            style={{ fontSize: 10.5, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', cursor: 'pointer', color: 'var(--navy)' }}>
                            {t('monthsAbbrev', { count: m })}
                          </button>
                        ))}
                      </div>
                      <input type="date" value={warrantyExpiresAt ?? ''} onChange={e => onWarrantyExpiresAtChange(e.target.value || null)}
                        style={{ fontSize: 12.5, padding: '4px 6px', width: '100%' }} onClick={e => e.stopPropagation()} />
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
