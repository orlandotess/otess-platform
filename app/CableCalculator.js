'use client';
import { useState } from 'react';
import { CatalogDescriptionInput } from './LineItemRow';
import { supabase } from '../lib/supabase';

const DEFAULT_FEET_PER_UNIT = { cable: '1000', tubo: '10' };

function suggestItemCode(desc) {
  return desc.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

export default function CableCalculator({ areaOptions = [], vendorOptions = [], catalogItems = [], onAdd, onClose }) {
  const catalogOptions = catalogItems.filter(c => c.type === 'product' && !c.internal_only);
  function resolveCatalogMaterial(value) {
    return catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
  }
  const [calcType, setCalcType] = useState('cable');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [segments, setSegments] = useState([{ label: '', feet: '', materials: [], calcDescription: '' }]);
  const [feetPerBox, setFeetPerBox] = useState(DEFAULT_FEET_PER_UNIT.cable);
  const [materialGroupTitle, setMaterialGroupTitle] = useState('Materiales de cable');

  const unitLabel = calcType === 'tubo' ? 'tubo' : 'caja';

  function handleTypeChange(type) {
    setCalcType(type);
    setFeetPerBox(DEFAULT_FEET_PER_UNIT[type]);
    setMaterialGroupTitle(type === 'tubo' ? 'Materiales de tubería' : 'Materiales de cable');
  }

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
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: [...seg.materials, { description: '', quantity: '', saveToCatalog: false, newItemCode: '' }] } : seg));
  }
  function updateMaterial(segIdx, matIdx, field, value) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.map((m, j) => j === matIdx ? { ...m, [field]: value } : m) } : seg));
  }
  function updateMaterialDescription(segIdx, matIdx, value) {
    const match = resolveCatalogMaterial(value);
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.map((m, j) => j === matIdx ? (match ? {
      ...m, description: match.name || match.description, unit_price: match.price ?? 0, supplier_price: match.supplier_price ?? 0, msrp: match.msrp ?? '', vendor: match.vendor || '', catalog_item_id: match.id,
    } : {
      ...m, description: value, unit_price: 0, supplier_price: 0, msrp: '', vendor: '', catalog_item_id: null,
    }) : m) } : seg));
  }
  function removeMaterial(segIdx, matIdx) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.filter((_, j) => j !== matIdx) } : seg));
  }

  const totalFeet = segments.reduce((sum, s) => sum + (parseFloat(s.feet) || 0), 0);
  function segmentUnitsNeeded(seg) {
    return feetPerBox > 0 ? Math.ceil((parseFloat(seg.feet) || 0) / parseFloat(feetPerBox)) : 0;
  }
  function segmentCalcDescription(seg) {
    return (seg.calcDescription || '').trim() || description.trim();
  }
  const boxesNeeded = segments.reduce((sum, s) => sum + segmentUnitsNeeded(s), 0);

  const materialTotals = (() => {
    const map = new Map();
    segments.forEach(seg => (seg.materials || []).forEach(m => {
      const desc = m.description.trim();
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
    }));
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

  async function handleAdd() {
    if (materialTotals.length === 0) return;
    const toSave = new Map();
    segments.forEach(seg => (seg.materials || []).forEach(m => {
      if (!m.saveToCatalog || m.catalog_item_id) return;
      const desc = m.description.trim();
      const code = (m.newItemCode || suggestItemCode(desc)).trim();
      if (!desc || !code || toSave.has(desc.toLowerCase())) return;
      toSave.set(desc.toLowerCase(), { desc, code, cost: parseFloat(m.supplier_price) || 0 });
    }));
    if (toSave.size > 0) {
      const results = await Promise.all([...toSave.values()].map(({ desc, code, cost }) =>
        supabase.from('catalog_items').insert([{
          type: 'product', item_code: code, name: desc, description: desc,
          price: cost, supplier_price: cost || null, vendor: vendor.trim() || null,
          tax_category: 'product', internal_only: false,
        }])
      ));
      const failed = results.find(r => r.error);
      if (failed) alert('No se pudo guardar en el catálogo: ' + failed.error.message);
    }
    materialTotals.forEach(item => {
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
      });
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>🧮 Calcular cable/tubo</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={calcType === 'cable' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
            onClick={() => handleTypeChange('cable')}
          >Cable</button>
          <button
            type="button"
            className={calcType === 'tubo' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
            onClick={() => handleTypeChange('tubo')}
          >Tubería</button>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Área</label>
          <input list="cable-calc-area-options" value={area} onChange={e => setArea(e.target.value)} placeholder="Piso 1, Oficina 2..." />
          <datalist id="cable-calc-area-options">
            {areaOptions.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Descripción del material</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Cat6 Cable Box, Tubo PVC 3/4..." />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Suplidor</label>
          <input list="cable-calc-vendor-options" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Adi, Multi Electric..." />
          <datalist id="cable-calc-vendor-options">
            {vendorOptions.map(v => <option key={v} value={v} />)}
          </datalist>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>Lados / corridas</label>
          {segments.map((seg, idx) => (
            <div key={idx} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={seg.label}
                  onChange={e => updateSegment(idx, 'label', e.target.value)}
                  placeholder={`Lado ${idx + 1}`}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  value={seg.feet}
                  onChange={e => updateSegment(idx, 'feet', e.target.value)}
                  placeholder="Pies"
                  min="0"
                  step="0.1"
                  style={{ width: 100 }}
                />
                {segments.length > 1 && (
                  <button type="button" onClick={() => removeSegment(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                )}
              </div>

              {seg.materials.map((mat, midx) => (
                <div key={midx} style={{ marginTop: 6, marginLeft: 20 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <CatalogDescriptionInput
                        value={mat.description}
                        onChange={v => updateMaterialDescription(idx, midx, v)}
                        catalogOptions={catalogOptions}
                        placeholder="Material (ej. Caja PVC 4x4x2)"
                        fontSize={12}
                        fontWeight={400}
                      />
                    </div>
                    <input
                      type="number"
                      value={mat.quantity}
                      onChange={e => updateMaterial(idx, midx, 'quantity', e.target.value)}
                      placeholder="Cant."
                      min="0"
                      step="1"
                      style={{ width: 70, fontSize: 12 }}
                    />
                    <button type="button" onClick={() => removeMaterial(idx, midx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>×</button>
                  </div>
                  {!mat.catalog_item_id && mat.description.trim() && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', fontSize: 11 }}>
                      <input
                        type="number"
                        value={mat.supplier_price ?? ''}
                        onChange={e => updateMaterial(idx, midx, 'supplier_price', e.target.value)}
                        placeholder="Costo"
                        min="0"
                        step="0.01"
                        style={{ width: 80, fontSize: 11 }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!mat.saveToCatalog} onChange={e => updateMaterial(idx, midx, 'saveToCatalog', e.target.checked)} />
                        Guardar en catálogo
                      </label>
                      {mat.saveToCatalog && (
                        <input
                          value={mat.newItemCode || suggestItemCode(mat.description)}
                          onChange={e => updateMaterial(idx, midx, 'newItemCode', e.target.value)}
                          placeholder="Código"
                          style={{ width: 90, fontSize: 11, fontFamily: 'monospace' }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginTop: 6, marginLeft: 20 }} onClick={() => addMaterial(idx)}>+ Material</button>
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
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addSegment}>+ Agregar lado</button>
        </div>

        {materialTotals.length > 0 && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11 }}>Título del grupo (en el estimado, estos materiales se combinan en una sola línea por área)</label>
              <input value={materialGroupTitle} onChange={e => setMaterialGroupTitle(e.target.value)} placeholder="Materiales de tubería" style={{ fontSize: 13 }} />
            </div>
            <p style={{ fontWeight: 700, color: 'var(--navy)', margin: '0 0 6px' }}>Materiales</p>
            {materialTotals.map(item => (
              <div key={item.desc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{item.desc}{item.supplier_price > 0 && ` (costo $${item.supplier_price.toFixed(2)})`}</span><span style={{ fontWeight: 700 }}>{item.qty}</span>
              </div>
            ))}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Pies por {unitLabel}</label>
          <input type="number" value={feetPerBox} onChange={e => setFeetPerBox(e.target.value)} min="0" step="1" placeholder={DEFAULT_FEET_PER_UNIT[calcType]} />
        </div>

        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Pies totales</span><span style={{ fontWeight: 700 }}>{totalFeet}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>{calcType === 'tubo' ? 'Tubos necesarios' : 'Cajas necesarias'}</span><span style={{ fontWeight: 700 }}>{boxesNeeded}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-primary" disabled={materialTotals.length === 0} onClick={handleAdd} style={{ flex: 1, justifyContent: 'center' }}>Agregar línea</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
