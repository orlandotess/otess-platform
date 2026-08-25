'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CatalogDescriptionInput } from './LineItemRow';
import { supabase } from '../lib/supabase';

const DEFAULT_FEET_PER_UNIT = { cable: '1000', tubo: '10' };
// Offered alongside the catalog results on the cable Tipo: the crew has to read
// the run and know which cable to pull, whether or not that cable is a catalog
// item yet. Picking one leaves it as free text, so its cost and markup can be
// typed underneath like any other new material.
const DEFAULT_CABLE_TYPES = ['Cat6 Riser', 'Cat6 Outdoor', 'Cat6 Plenum', 'Cat5 Outdoor'];

function suggestItemCode(desc) {
  return desc.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

function emptyAccessory() {
  return { description: '', quantity: '', saveToCatalog: true, newItemCode: '' };
}

// Pricing carried by a catalog pick. The tubo and the cable are the priciest
// things on a run, and until they could be picked from the catalog they were
// the only materials that always went out at $0 — the calculated count reused
// an accessory's price only if one happened to share its description.
const EMPTY_MATERIAL_META = { unit_price: '', supplier_price: '', msrp: '', vendor: '', catalog_item_id: null, markup_pct: '', saveToCatalog: true, newItemCode: '' };

// What a material is worth on the line. A catalog pick carries its own price;
// anything typed here is worth its cost plus its markup — the same arithmetic
// that saves it to the catalog further down. Until this existed the two
// disagreed: a material typed with cost and markup was filed in the catalog at
// the marked-up price and quoted to the client at $0.
function materialUnitPrice(m) {
  if (m?.catalog_item_id) return parseFloat(m.unit_price) || 0;
  const own = parseFloat(m?.unit_price);
  if (!isNaN(own) && own > 0) return own;
  const cost = parseFloat(m?.supplier_price) || 0;
  const pct = m?.markup_pct !== '' && m?.markup_pct != null ? parseFloat(m.markup_pct) : null;
  return cost > 0 && pct != null && !isNaN(pct) ? markedUpPrice(cost, pct) : cost;
}
// Rounded to the cent, the way Catálogo rounds it when the same markup is
// applied there — otherwise the line carries 1.3095, the catalog carries
// 1.31, and 16 of them disagree by a penny.
function markedUpPrice(cost, pct) {
  return Math.round(cost * (1 + pct / 100) * 100) / 100;
}
function catalogMeta(match) {
  if (!match) return { ...EMPTY_MATERIAL_META };
  return {
    unit_price: match.price ?? 0,
    supplier_price: match.supplier_price ?? 0,
    msrp: match.msrp ?? '',
    vendor: match.vendor || '',
    catalog_item_id: match.id,
    markup_pct: '',
    saveToCatalog: false,
    newItemCode: '',
  };
}
function emptyCableRow() {
  return { name: '', area: '', type: '', qty: '1', feet: '', materials: [], typeMeta: { ...EMPTY_MATERIAL_META } };
}
function emptySegment() {
  return { label: '', feet: '', materials: [], calcDescription: '', calcMeta: { ...EMPTY_MATERIAL_META } };
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
      unit_price: existing?.unit_price ?? materialUnitPrice(m),
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
  const [descriptionMeta, setDescriptionMeta] = useState({ ...EMPTY_MATERIAL_META });
  const [vendor, setVendor] = useState('');
  const [feetPerBox, setFeetPerBox] = useState(DEFAULT_FEET_PER_UNIT.cable);
  const [materialGroupTitle, setMaterialGroupTitle] = useState(t('materialGroupTitleDefault.cable'));

  const unitLabel = calcType === 'tubo' ? t('unit.tubo') : t('unit.box');

  // Every field that names a material resolves the same way: picking a catalog
  // result stores the item's own description plus its pricing, typing free text
  // clears the pricing back out.
  function updateDescription(value) {
    const match = resolveCatalogMaterial(value);
    setDescription(match ? (match.name || match.description) : value);
    setDescriptionMeta(catalogMeta(match));
  }
  function updateDescriptionMeta(field, value) {
    setDescriptionMeta(m => ({ ...m, [field]: value }));
  }

  function handleTypeChange(type) {
    setCalcType(type);
    setFeetPerBox(DEFAULT_FEET_PER_UNIT[type]);
    setMaterialGroupTitle(t(`materialGroupTitleDefault.${type}`));
  }

  // ---------------------------------------------------------------------
  // Tubería: "Lados / Corridas" — one run of pipe per side, with its own
  // fittings and a calculated tubo count (feet ÷ pies-por-tubo).
  // ---------------------------------------------------------------------
  const [segments, setSegments] = useState([emptySegment()]);

  function updateSegment(idx, field, value) {
    setSegments(s => s.map((seg, i) => i === idx ? { ...seg, [field]: value } : seg));
  }
  function addSegment() {
    setSegments(s => [...s, emptySegment()]);
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
  function updateSegmentType(idx, value) {
    const match = resolveCatalogMaterial(value);
    setSegments(s => s.map((seg, i) => i === idx
      ? { ...seg, calcDescription: match ? (match.name || match.description) : value, calcMeta: catalogMeta(match) }
      : seg));
  }
  function updateSegmentMeta(idx, field, value) {
    setSegments(s => s.map((seg, i) => i === idx
      ? { ...seg, calcMeta: { ...(seg.calcMeta ?? EMPTY_MATERIAL_META), [field]: value } }
      : seg));
  }
  // A lado that doesn't name its own tubería falls back to the run's default —
  // description and pricing together, so the fallback isn't priced at $0 just
  // for being a fallback.
  function segmentMaterial(seg) {
    const own = (seg.calcDescription || '').trim();
    return own
      ? { desc: own, meta: seg.calcMeta ?? EMPTY_MATERIAL_META }
      : { desc: description.trim(), meta: descriptionMeta };
  }
  const totalFeet = segments.reduce((sum, s) => sum + (parseFloat(s.feet) || 0), 0);
  const boxesNeeded = segments.reduce((sum, s) => sum + segmentUnitsNeeded(s), 0);

  const tuboMaterialTotals = (() => {
    const map = new Map();
    segments.forEach(seg => mergeAccessoryMaterials(map, seg.materials));
    // Rounded per lado (not on the combined total): a partial stick left over
    // from one physical run isn't usable in a separate one.
    segments.forEach(seg => {
      const { desc: segDesc, meta } = segmentMaterial(seg);
      const segQty = segmentUnitsNeeded(seg);
      if (!segDesc || segQty <= 0) return;
      const key = segDesc.toLowerCase();
      const existing = map.get(key);
      map.set(key, {
        desc: existing ? existing.desc : segDesc,
        qty: (existing?.qty || 0) + segQty,
        // `||`, not `??`: an accessory row typed with this same description but
        // left unpriced used to win and send the tubo out at $0. A real price
        // from either side wins over a zero from the other.
        unit_price: existing?.unit_price || materialUnitPrice(meta),
        // parseFloat: a meta typed into the form carries strings, and the
        // totals preview formats this with toFixed().
        supplier_price: existing?.supplier_price || parseFloat(meta.supplier_price) || 0,
        msrp: existing?.msrp || meta.msrp || '',
        vendor: existing?.vendor || meta.vendor || '',
        catalog_item_id: existing?.catalog_item_id ?? meta.catalog_item_id ?? null,
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
  const [cableRows, setCableRows] = useState([emptyCableRow()]);
  const cableTypeOptions = [...new Set([...DEFAULT_CABLE_TYPES, ...cableRows.map(r => r.type.trim()).filter(Boolean)])];

  function addCableRow() {
    setCableRows(r => [...r, emptyCableRow()]);
  }
  function updateCableRowTypeMeta(idx, field, value) {
    setCableRows(r => r.map((row, i) => i === idx
      ? { ...row, typeMeta: { ...(row.typeMeta ?? EMPTY_MATERIAL_META), [field]: value } }
      : row));
  }
  function updateCableRowType(idx, value) {
    const match = resolveCatalogMaterial(value);
    setCableRows(r => r.map((row, i) => i === idx
      ? { ...row, type: match ? (match.name || match.description) : value, typeMeta: catalogMeta(match) }
      : row));
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
      const rowMeta = row.typeMeta ?? EMPTY_MATERIAL_META;
      map.set(key, {
        type: existing ? existing.type : type,
        feet: (existing?.feet || 0) + feet,
        // Corridas pool by type, so the pricing comes from whichever corrida
        // actually priced the cable — picked it from the catalog, or typed its
        // cost. The rest only named it.
        meta: materialUnitPrice(existing?.meta) > 0 ? existing.meta : (materialUnitPrice(rowMeta) > 0 ? rowMeta : (existing?.meta ?? rowMeta)),
      });
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
      const meta = tt.meta ?? EMPTY_MATERIAL_META;
      map.set(key, {
        desc: existing ? existing.desc : tt.type,
        qty: (existing?.qty || 0) + tt.boxes,
        // Same rule as the tubo above: a real price beats a zero, whichever
        // side it came from.
        unit_price: existing?.unit_price || materialUnitPrice(meta),
        // parseFloat: a meta typed into the form carries strings, and the
        // totals preview formats this with toFixed().
        supplier_price: existing?.supplier_price || parseFloat(meta.supplier_price) || 0,
        msrp: existing?.msrp || meta.msrp || '',
        vendor: existing?.vendor || meta.vendor || '',
        catalog_item_id: existing?.catalog_item_id ?? meta.catalog_item_id ?? null,
      });
    });
    return [...map.values()];
  })();

  const materialTotals = calcType === 'tubo' ? tuboMaterialTotals : cableMaterialTotals;

  async function handleAdd() {
    if (materialTotals.length === 0) return;
    const toSave = new Map();
    // Every field that names a material feeds this, not just the accessory
    // rows: a tubería or a cable typed with its cost belongs in the catalog
    // for the same reason a locknut does — so the next run finds it priced.
    const namedMaterials = calcType === 'tubo'
      ? [
          ...segments.flatMap(seg => seg.materials || []),
          ...segments.map(seg => ({ ...(seg.calcMeta ?? {}), description: (seg.calcDescription || '').trim() })),
          { ...descriptionMeta, description: description.trim() },
        ]
      : [
          ...cableRows.flatMap(row => row.materials || []),
          ...cableRows.map(row => ({ ...(row.typeMeta ?? {}), description: row.type.trim() })),
        ];
    namedMaterials.forEach(m => {
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
          price: cost > 0 && pct != null ? markedUpPrice(cost, pct) : cost,
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
        // On estimates the first material of the batch becomes the parent row
        // and the rest hang off it as accessories (see addPrefilledItem in
        // app/estimados/EstimateForm.js). Seeding that parent's
        // group_description with the group title makes the client-facing row
        // read "Pipe, Box and Miscellaneous" instead of whichever material
        // happened to sort first ("Tubo pvc 1\""). Still editable per line
        // afterwards — but only seed it when the batch actually produces
        // accessories, since the estimate form only exposes the field for a
        // parent that has children (isGroupHead); a lone material would carry
        // a description the user could no longer edit.
        group_description: groupIndex === 0 && materialTotals.length > 1 ? (materialGroupTitle.trim() || null) : null,
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
        // How many materials this "Agregar línea" click produced. Proposals use
        // it to decide whether the batch is worth grouping under a parent line
        // at all — a lone material has nothing to group and stays a plain line.
        groupCount: materialTotals.length,
      });
    });
  }

  // Cost, markup and "save to catalog" for a material that isn't in the catalog
  // yet. Offered under every field that names one — the accessories, the tubo
  // and the cable alike — since the catalog rarely has the tubería already and
  // typing the cost here is the whole point.
  function renderNewMaterialFields(description, meta, onField) {
    if (meta?.catalog_item_id || !(description || '').trim()) return null;
    return (
      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', fontSize: 11, flexWrap: 'wrap' }}>
        <input
          type="number"
          value={meta?.supplier_price ?? ''}
          onChange={e => onField('supplier_price', e.target.value)}
          placeholder={t('accessory.costPlaceholder')}
          min="0"
          step="0.01"
          style={{ width: 80, fontSize: 11 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
          <input type="checkbox" checked={!!meta?.saveToCatalog} onChange={e => onField('saveToCatalog', e.target.checked)} />
          {t('accessory.saveToCatalog')}
        </label>
        {meta?.saveToCatalog && (
          <>
            <input
              value={meta.newItemCode || suggestItemCode(description)}
              onChange={e => onField('newItemCode', e.target.value)}
              placeholder={t('accessory.codePlaceholder')}
              style={{ width: 90, fontSize: 11, fontFamily: 'monospace' }}
            />
            <input
              type="number"
              value={meta.markup_pct ?? ''}
              onChange={e => onField('markup_pct', e.target.value)}
              placeholder={t('accessory.markupPlaceholder')}
              min="0"
              step="1"
              title={t('accessory.markupTitle')}
              style={{ width: 70, fontSize: 11 }}
            />
          </>
        )}
      </div>
    );
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
            {renderNewMaterialFields(mat.description, mat, (field, value) => onFieldChange(midx, field, value))}
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
            <CatalogDescriptionInput
              value={description}
              onChange={updateDescription}
              catalogOptions={catalogOptions}
              placeholder={t('materialDescriptionPlaceholder')}
              fontSize={13.5}
              fontWeight={400}
            />
            {renderNewMaterialFields(description, descriptionMeta, updateDescriptionMeta)}
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
                {/* Shown from the start, not once the count turns positive: the
                    tubería has to be nameable while the pies are being typed,
                    which is the whole point of the field. */}
                <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 20, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2, textTransform: 'none', letterSpacing: 'normal' }}>{t('segments.pipeTypeLabel')}</label>
                    <CatalogDescriptionInput
                      value={segmentMaterial(seg).desc}
                      onChange={v => updateSegmentType(idx, v)}
                      catalogOptions={catalogOptions}
                      placeholder={t('materialDescriptionPlaceholder')}
                      fontSize={12}
                      fontWeight={400}
                    />
                  </div>
                  <div style={{ width: 70, textAlign: 'center' }}>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2, textTransform: 'none', letterSpacing: 'normal' }}>{t('segments.unitsLabel')}</label>
                    <div style={{ fontSize: 13, fontWeight: 700, padding: '7px 0' }}>{segmentUnitsNeeded(seg)}</div>
                  </div>
                </div>
                {(seg.calcDescription || '').trim() !== '' && (
                  <div style={{ marginLeft: 20 }}>
                    {renderNewMaterialFields(seg.calcDescription, seg.calcMeta, (field, value) => updateSegmentMeta(idx, field, value))}
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
                <div style={{ marginTop: 6 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2, textTransform: 'none', letterSpacing: 'normal' }}>{t('cableRows.columns.type')}</label>
                  <CatalogDescriptionInput
                    value={row.type}
                    onChange={v => updateCableRowType(idx, v)}
                    catalogOptions={catalogOptions}
                    suggestions={cableTypeOptions}
                    placeholder={t('cableRows.typePlaceholder')}
                    fontSize={12.5}
                    fontWeight={400}
                  />
                  {renderNewMaterialFields(row.type, row.typeMeta, (field, value) => updateCableRowTypeMeta(idx, field, value))}
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
