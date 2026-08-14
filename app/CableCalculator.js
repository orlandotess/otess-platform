'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CatalogDescriptionInput } from './LineItemRow';
import { supabase } from '../lib/supabase';

const DEFAULT_FEET_PER_UNIT = { cable: '1000', tubo: '10' };
const DEFAULT_CABLE_TYPES = ['Cat6 Riser', 'Cat6 Outdoor', 'Cat6 Plenum', 'Cat5 Outdoor'];

function suggestItemCode(desc) {
  return desc.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

function emptyAccessory() {
  return { description: '', quantity: '', saveToCatalog: true, newItemCode: '' };
}

// Merges a flat list of accessory rows (per-material description/qty/cost) into
// one entry per distinct description, carrying over cost/catalog info from
// whichever row set it first. Shared between the Tubería (per-lado) and Cable
// (per-corrida) accessory lists.
function mergeAccessoryMaterials(map, materials) {
  (materials || []).forEach(m => {
    const desc = (m.description || '').trim();
    const qty = parseFloat(m.quantity) || 0;
    if (!desc || qty <= 0) return;
    const key = desc.toLowerCase();
    const existing = map.get(key);
    map.set(key, {
      desc: existing ? existing.desc : desc,
      qty: (existing?.qty || 0) + qty,
      unit_price: existing?.unit_price ?? (parseFloat(m.unit_price) || 0),
      supplier_price: existing?.supplier_price ?? (parseFloat(m.supplier_price) || 0),
      msrp: existing?.msrp ?? (m.msrp ?? ''),
      vendor: existing?.vendor ?? (m.vendor || ''),
      catalog_item_id: existing?.catalog_item_id ?? (m.catalog_item_id || null),
    });
  });
}

export default function CableCalculator({ areaOptions = [], vendorOptions = [], catalogItems = [], onAdd, onClose }) {
  const t = useTranslations('shared.cableCalculator');
  const catalogOptions = catalogItems.filter(c => c.type === 'product' && !c.internal_only);
  function resolveCatalogMaterial(value) {
    return catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
  }

  const [calcType, setCalcType] = useState('cable');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [feetPerBox, setFeetPerBox] = useState(DEFAULT_FEET_PER_UNIT.cable);
  const [materialGroupTitle, setMaterialGroupTitle] = useState(t('materialGroupTitleDefault.cable'));

  const unitLabel = calcType === 'tubo' ? t('unit.tubo') : t('unit.box');

  function handleTypeChange(type) {
    setCalcType(type);
    setFeetPerBox(DEFAULT_FEET_PER_UNIT[type]);
    setMaterialGroupTitle(t(`materialGroupTitleDefault.${type}`));
  }

  // ---------------------------------------------------------------------
  // Tubería: "Lados / Corridas" — one run of pipe per side, with its own
  // fittings and a calculated tubo count (feet ÷ pies-por-tubo).
  // ---------------------------------------------------------------------
  const [segments, setSegments] = useState([{ label: '', feet: '', materials: [], calcDescription: '' }]);

  function updateSegment(idx, field, value) {
    setSegments(s => s.map((seg, i) => i === idx ? { ...seg, [field]: value } : seg));
  }
  function addSegment() {
    setSegments(s => [...s, { label: '', feet: '', materials: [], calcDescription: '' }]);
  }
  function removeSegment(idx) {
    setSegments(s => s.filter((_, i) => i !== idx));
  }
  function addMaterial(segIdx) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: [...seg.materials, emptyAccessory()] } : seg));
  }
  function updateMaterial(segIdx, matIdx, field, value) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.map((m, j) => j === matIdx ? { ...m, [field]: value } : m) } : seg));
  }
  function updateMaterialDescription(segIdx, matIdx, value) {
    const match = resolveCatalogMaterial(value);
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.map((m, j) => j === matIdx ? (match ? {
      ...m, description: match.name || match.description, unit_price: match.price ?? 0, supplier_price: match.supplier_price ?? 0, msrp: match.msrp ?? '', vendor: match.vendor || '', catalog_item_id: match.id,
    } : {
      ...m, description: value, unit_price: '', supplier_price: '', msrp: '', vendor: '', catalog_item_id: null,
    }) : m) } : seg));
  }
  function removeMaterial(segIdx, matIdx) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.filter((_, j) => j !== matIdx) } : seg));
  }

  function segmentUnitsNeeded(seg) {
    return feetPerBox > 0 ? Math.ceil((parseFloat(seg.feet) || 0) / parseFloat(feetPerBox)) : 0;
  }
  function segmentCalcDescription(seg) {
    return (seg.calcDescription || '').trim() || description.trim();
  }
  const totalFeet = segments.reduce((sum, s) => sum + (parseFloat(s.feet) || 0), 0);
  const boxesNeeded = segments.reduce((sum, s) => sum + segmentUnitsNeeded(s), 0);

  const tuboMaterialTotals = (() => {
    const map = new Map();
    segments.forEach(seg => mergeAccessoryMaterials(map, seg.materials));
    // Rounded per lado (not on the combined total): a partial stick left over
    // from one physical run isn't usable in a separate one.
    segments.forEach(seg => {
      const segDesc = segmentCalcDescription(seg);
      const segQty = segmentUnitsNeeded(seg);
      if (!segDesc || segQty <= 0) return;
      const key = segDesc.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        desc: existing ? existing.desc : segDesc,
        qty: (existing?.qty || 0) + segQty,
        unit_price: existing?.unit_price ?? 0,
        supplier_price: existing?.supplier_price ?? 0,
        msrp: existing?.msrp ?? '',
        vendor: existing?.vendor ?? '',
        catalog_item_id: existing?.catalog_item_id ?? null,
      });
    });
    return [...map.values()];
  })();

  // ---------------------------------------------------------------------
  // Cable: a flat list of named corridas (drops), each tagged with a cable
  // Tipo (Cat6 Riser, Cat6 Outdoor...). Corridas sharing a Tipo pool their
  // footage into one box count — unlike tubería, cable reels get pulled
  // across many drops from the same spool, so rounding happens once per
  // Tipo, not per corrida.
  // ---------------------------------------------------------------------
  const [cableRows, setCableRows] = useState([{ name: '', area: '', type: '', qty: '1', feet: '', materials: [] }]);
  const cableTypeOptions = [...new Set([...DEFAULT_CABLE_TYPES, ...cableRows.map(r => r.type.trim()).filter(Boolean)])];

  function addCableRow() {
    setCableRows(r => [...r, { name: '', area: '', type: '', qty: '1', feet: '', materials: [] }]);
  }
  function updateCableRow(idx, field, value) {
    setCableRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }
  function removeCableRow(idx) {
    setCableRows(r => r.filter((_, i) => i !== idx));
  }
  function addCableRowMaterial(rowIdx) {
    setCableRows(r => r.map((row, i) => i === rowIdx ? { ...row, materials: [...row.materials, emptyAccessory()] } : row));
  }
  function updateCableRowMaterial(rowIdx, matIdx, field, value) {
    setCableRows(r => r.map((row, i) => i === rowIdx ? { ...row, materials: row.materials.map((m, j) => j === matIdx ? { ...m, [field]: value } : m) } : row));
  }
  function updateCableRowMaterialDescription(rowIdx, matIdx, value) {
    const match = resolveCatalogMaterial(value);
    setCableRows(r => r.map((row, i) => i === rowIdx ? { ...row, materials: row.materials.map((m, j) => j === matIdx ? (match ? {
      ...m, description: match.name || match.description, unit_price: match.price ?? 0, supplier_price: match.supplier_price ?? 0, msrp: match.msrp ?? '', vendor: match.vendor || '', catalog_item_id: match.id,
    } : {
      ...m, description: value, unit_price: '', supplier_price: '', msrp: '', vendor: '', catalog_item_id: null,
    }) : m) } : row));
  }
  function removeCableRowMaterial(rowIdx, matIdx) {
    setCableRows(r => r.map((row, i) => i === rowIdx ? { ...row, materials: row.materials.filter((_, j) => j !== matIdx) } : row));
  }

  function cableRowFeetTotal(row) {
    return (parseFloat(row.qty) || 0) * (parseFloat(row.feet) || 0);
  }
  const cableTotalFeet = cableRows.reduce((sum, r) => sum + cableRowFeetTotal(r), 0);

  const cableTypeTotals = (() => {
    const map = new Map();
    cableRows.forEach(row => {
      const type = row.type.trim();
      const feet = cableRowFeetTotal(row);
      if (!type || feet <= 0) return;
      const key = type.toLowerCase();
      const existing = map.get(key);
      map.set(key, { type: existing ? existing.type : type, feet: (existing?.feet || 0) + feet });
    });
    return [...map.values()].map(tt => ({ ...tt, boxes: feetPerBox > 0 ? Math.ceil(tt.feet / parseFloat(feetPerBox)) : 0 }));
  })();

  const cableMaterialTotals = (() => {
    const map = new Map();
    cableRows.forEach(row => mergeAccessoryMaterials(map, row.materials));
    cableTypeTotals.forEach(tt => {
      if (tt.boxes <= 0) return;
      const key = tt.type.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        desc: existing ? existing.desc : tt.type,
        qty: (existing?.qty || 0) + tt.boxes,
        unit_price: existing?.unit_price ?? 0,
        supplier_price: existing?.supplier_price ?? 0,
        msrp: existing?.msrp ?? '',
        vendor: existing?.vendor ?? '',
        catalog_item_id: existing?.catalog_item_id ?? null,
      });
    });
    return [...map.values()];
  })();

  const materialTotals = calcType === 'tubo' ? tuboMaterialTotals : cableMaterialTotals;

  async function handleAdd() {
    if (materialTotals.length === 0) return;
    const toSave = new Map();
    const accessoryRows = calcType === 'tubo'
      ? segments.flatMap(seg => seg.materials || [])
      : cableRows.flatMap(row => row.materials || []);
    accessoryRows.forEach(m => {
      if (!m.saveToCatalog || m.catalog_item_id) return;
      const desc = (m.description || '').trim();
      const code = (m.newItemCode || suggestItemCode(desc)).trim();
      if (!desc || !code || toSave.has(desc.toLowerCase())) return;
      const cost = parseFloat(m.supplier_price) || 0;
      const pct = m.markup_pct !== '' && m.markup_pct != null ? parseFloat(m.markup_pct) : null;
      toSave.set(desc.toLowerCase(), { desc, code, cost, pct });
    });
    if (toSave.size > 0) {
      const results = await Promise.all([...toSave.values()].map(({ desc, code, cost, pct }) =>
        supabase.from('catalog_items').insert([{
          type: 'product', item_code: code, name: desc, description: desc,
          price: cost > 0 && pct != null ? cost * (1 + pct / 100) : cost,
          supplier_price: cost || null, markup_pct: pct, vendor: vendor.trim() || null,
          tax_category: 'product', internal_only: false,
        }])
      ));
      const failed = results.find(r => r.error);
      if (failed) alert(t('saveCatalogError', { error: failed.error.message }));
    }
    materialTotals.forEach((item, groupIndex) => {
      onAdd({
        title: materialGroupTitle.trim() || null,
        description: item.desc,
        area: area.trim() || '',
        vendor: item.vendor || vendor.trim() || '',
        quantity: item.qty,
        unit_price: item.unit_price || 0,
        supplier_price: item.supplier_price || 0,
        msrp: item.msrp || '',
        catalog_item_id: item.catalog_item_id || null,
        from_calculator: true,
        groupIndex,
      });
    });
  }

  function renderAccessoryList(materials, onFieldChange, onRemove, onAddClick) {
    return (
      <>
        {materials.map((mat, midx) => (
          <div key={midx} style={{ marginTop: 6, marginLeft: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <CatalogDescriptionInput
                  value={mat.description}
                  onChange={v => onFieldChange(midx, 'description', v)}
                  catalogOptions={catalogOptions}
                  placeholder={t('accessory.materialPlaceholder')}
                  fontSize={12}
                  fontWeight={400}
                />
              </div>
              <input
                type="number"
                value={mat.quantity}
                onChange={e => onFieldChange(midx, 'quantity', e.target.value)}
                placeholder={t('accessory.quantityPlaceholder')}
                min="0"
                step="1"
                style={{ width: 70, fontSize: 12 }}
              />
              <button type="button" onClick={() => onRemove(midx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
            </div>
            {!mat.catalog_item_id && mat.description.trim() && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  value={mat.supplier_price ?? ''}
                  onChange={e => onFieldChange(midx, 'supplier_price', e.target.value)}
                  placeholder={t('accessory.costPlaceholder')}
                  min="0"
                  step="0.01"
                  style={{ width: 80, fontSize: 11 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
                  <input type="checkbox" checked={!!mat.saveToCatalog} onChange={e => onFieldChange(midx, 'saveToCatalog', e.target.checked)} />
                  {t('accessory.saveToCatalog')}
                </label>
                {mat.saveToCatalog && (
                  <>
                    <input
                      value={mat.newItemCode || suggestItemCode(mat.description)}
                      onChange={e => onFieldChange(midx, 'newItemCode', e.target.value)}
                      placeholder={t('accessory.codePlaceholder')}
                      style={{ width: 90, fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <input
                      type="number"
                      value={mat.markup_pct ?? ''}
                      onChange={e => onFieldChange(midx, 'markup_pct', e.target.value)}
                      placeholder={t('accessory.markupPlaceholder')}
                      min="0"
                      step="1"
                      title={t('accessory.markupTitle')}
                      style={{ width: 70, fontSize: 11 }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginTop: 6, marginLeft: 20 }} onClick={onAddClick}>+ {t('accessory.addMaterial')}</button>
      </>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: calcType === 'cable' ? 560 : 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>🧮 {t('title')}</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={calcType === 'cable' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
            onClick={() => handleTypeChange('cable')}
          >{t('typeCable')}</button>
          <button
            type="button"
            className={calcType === 'tubo' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
            onClick={() => handleTypeChange('tubo')}
          >{t('typeTubo')}</button>
        </div>

        {calcType === 'tubo' && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>{t('areaLabel')}</label>
            <input list="cable-calc-area-options" value={area} onChange={e => setArea(e.target.value)} placeholder={t('areaPlaceholder')} />
          </div>
        )}
        <datalist id="cable-calc-area-options">
          {areaOptions.map(a => <option key={a} value={a} />)}
        </datalist>

        {calcType === 'tubo' && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>{t('materialDescriptionLabel')}</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('materialDescriptionPlaceholder')} />
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>{t('vendorLabel')}</label>
          <input list="cable-calc-vendor-options" value={vendor} onChange={e => setVendor(e.target.value)} placeholder={t('vendorPlaceholder')} />
          <datalist id="cable-calc-vendor-options">
            {vendorOptions.map(v => <option key={v} value={v} />)}
          </datalist>
        </div>

        {calcType === 'tubo' ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>{t('segments.label')}</label>
            {segments.map((seg, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={seg.label}
                    onChange={e => updateSegment(idx, 'label', e.target.value)}
                    placeholder={t('segments.sidePlaceholder', { number: idx + 1 })}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    value={seg.feet}
                    onChange={e => updateSegment(idx, 'feet', e.target.value)}
                    placeholder={t('segments.feetPlaceholder')}
                    min="0"
                    step="0.1"
                    style={{ width: 100 }}
                  />
                  {segments.length > 1 && (
                    <button type="button" onClick={() => removeSegment(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  )}
                </div>

                {renderAccessoryList(
                  seg.materials,
                  (midx, field, value) => field === 'description' ? updateMaterialDescription(idx, midx, value) : updateMaterial(idx, midx, field, value),
                  midx => removeMaterial(idx, midx),
                  () => addMaterial(idx)
                )}
                {segmentUnitsNeeded(seg) > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 20, alignItems: 'center' }}>
                    <input
                      value={segmentCalcDescription(seg)}
                      onChange={e => updateSegment(idx, 'calcDescription', e.target.value)}
                      style={{ flex: 1, fontSize: 12 }}
                    />
                    <span style={{ width: 70, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{segmentUnitsNeeded(seg)}</span>
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addSegment}>+ {t('segments.addSide')}</button>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>{t('cableRows.label')}</label>
            <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, padding: '0 4px' }}>
              <span style={{ flex: '2 1 0' }}>{t('cableRows.columns.name')}</span>
              <span style={{ flex: '1.2 1 0' }}>{t('cableRows.columns.area')}</span>
              <span style={{ flex: '1.4 1 0' }}>{t('cableRows.columns.type')}</span>
              <span style={{ width: 56 }}>{t('cableRows.columns.qty')}</span>
              <span style={{ width: 56 }}>{t('cableRows.columns.feet')}</span>
              <span style={{ width: 16 }} />
            </div>
            {cableRows.map((row, idx) => (
              <div key={idx} style={{ marginBottom: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={row.name}
                    onChange={e => updateCableRow(idx, 'name', e.target.value)}
                    placeholder={t('cableRows.namePlaceholder')}
                    style={{ flex: '2 1 0', fontSize: 12.5 }}
                  />
                  <input
                    list="cable-calc-area-options"
                    value={row.area}
                    onChange={e => updateCableRow(idx, 'area', e.target.value)}
                    placeholder={t('cableRows.columns.area')}
                    style={{ flex: '1.2 1 0', fontSize: 12.5 }}
                  />
                  <input
                    list={`cable-type-options-${idx}`}
                    value={row.type}
                    onChange={e => updateCableRow(idx, 'type', e.target.value)}
                    placeholder={t('cableRows.columns.type')}
                    style={{ flex: '1.4 1 0', fontSize: 12.5 }}
                  />
                  <datalist id={`cable-type-options-${idx}`}>
                    {cableTypeOptions.map(ct => <option key={ct} value={ct} />)}
                  </datalist>
                  <input
                    type="number"
                    className="compact-number"
                    value={row.qty}
                    onChange={e => updateCableRow(idx, 'qty', e.target.value)}
                    placeholder={t('accessory.quantityPlaceholder')}
                    min="0"
                    step="1"
                    style={{ width: 56, fontSize: 12.5 }}
                  />
                  <input
                    type="number"
                    className="compact-number"
                    value={row.feet}
                    onChange={e => updateCableRow(idx, 'feet', e.target.value)}
                    placeholder={t('segments.feetPlaceholder')}
                    min="0"
                    step="1"
                    style={{ width: 56, fontSize: 12.5 }}
                  />
                  {cableRows.length > 1 && (
                    <button type="button" onClick={() => removeCableRow(idx)} style={{ width: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  )}
                </div>
                {renderAccessoryList(
                  row.materials,
                  (midx, field, value) => field === 'description' ? updateCableRowMaterialDescription(idx, midx, value) : updateCableRowMaterial(idx, midx, field, value),
                  midx => removeCableRowMaterial(idx, midx),
                  () => addCableRowMaterial(idx)
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addCableRow}>+ {t('cableRows.addRow')}</button>
          </div>
        )}

        {materialTotals.length > 0 && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11 }}>{t('groupTitleLabel')}</label>
              <input value={materialGroupTitle} onChange={e => setMaterialGroupTitle(e.target.value)} placeholder={t('materialGroupTitleDefault.cable')} style={{ fontSize: 13 }} />
            </div>
            <p style={{ fontWeight: 700, color: 'var(--navy)', margin: '0 0 6px' }}>{t('materialsHeading')}</p>
            {materialTotals.map(item => (
              <div key={item.desc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{item.desc}{item.supplier_price > 0 && ` (${t('costSuffix', { cost: item.supplier_price.toFixed(2) })})`}</span><span style={{ fontWeight: 700 }}>{item.qty}</span>
              </div>
            ))}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>{t('feetPerUnitLabel', { unit: unitLabel })}</label>
          <input type="number" value={feetPerBox} onChange={e => setFeetPerBox(e.target.value)} min="0" step="1" placeholder={DEFAULT_FEET_PER_UNIT[calcType]} />
        </div>

        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>{t('totalFeetLabel')}</span><span style={{ fontWeight: 700 }}>{calcType === 'tubo' ? totalFeet : cableTotalFeet}</span>
          </div>
          {calcType === 'tubo' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>{t('tubesNeededLabel')}</span><span style={{ fontWeight: 700 }}>{boxesNeeded}</span>
            </div>
          ) : (
            cableTypeTotals.map(ct => (
              <div key={ct.type} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{t('cableTypeFeet', { type: ct.type, feet: ct.feet })}</span><span style={{ fontWeight: 700 }}>{t('boxesCount', { count: ct.boxes })}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-primary" disabled={materialTotals.length === 0} onClick={handleAdd} style={{ flex: 1, justifyContent: 'center' }}>{t('addLine')}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
