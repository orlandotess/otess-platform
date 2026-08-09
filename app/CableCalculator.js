'use client';
import { useState } from 'react';

const DEFAULT_FEET_PER_UNIT = { cable: '1000', tubo: '10' };

export default function CableCalculator({ areaOptions = [], vendorOptions = [], materialOptions = [], onAdd, onClose }) {
  const [calcType, setCalcType] = useState('cable');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [segments, setSegments] = useState([{ label: '', feet: '', materials: [] }]);
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
    setSegments(s => [...s, { label: '', feet: '', materials: [] }]);
  }
  function removeSegment(idx) {
    setSegments(s => s.filter((_, i) => i !== idx));
  }

  function addMaterial(segIdx) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: [...seg.materials, { description: '', quantity: '' }] } : seg));
  }
  function updateMaterial(segIdx, matIdx, field, value) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.map((m, j) => j === matIdx ? { ...m, [field]: value } : m) } : seg));
  }
  function removeMaterial(segIdx, matIdx) {
    setSegments(s => s.map((seg, i) => i === segIdx ? { ...seg, materials: seg.materials.filter((_, j) => j !== matIdx) } : seg));
  }

  const totalFeet = segments.reduce((sum, s) => sum + (parseFloat(s.feet) || 0), 0);
  const boxesNeeded = feetPerBox > 0 ? Math.ceil(totalFeet / parseFloat(feetPerBox)) : 0;

  const materialTotals = (() => {
    const map = new Map();
    segments.forEach(seg => (seg.materials || []).forEach(m => {
      const desc = m.description.trim();
      const qty = parseFloat(m.quantity) || 0;
      if (!desc || qty <= 0) return;
      const key = desc.toLowerCase();
      const existing = map.get(key);
      map.set(key, { desc: existing ? existing.desc : desc, qty: (existing?.qty || 0) + qty });
    }));
    const mainDesc = description.trim();
    if (mainDesc && boxesNeeded > 0) {
      const key = mainDesc.toLowerCase();
      const existing = map.get(key);
      map.set(key, { desc: existing ? existing.desc : mainDesc, qty: (existing?.qty || 0) + boxesNeeded });
    }
    return [...map.values()].map(({ desc, qty }) => [desc, qty]);
  })();

  function handleAdd() {
    if (!description.trim() || boxesNeeded <= 0) return;
    materialTotals.forEach(([desc, qty]) => {
      onAdd({
        title: materialGroupTitle.trim() || null,
        description: desc,
        area: area.trim() || '',
        vendor: vendor.trim() || '',
        quantity: qty,
        unit_price: 0,
        supplier_price: 0,
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
                <div key={midx} style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 20, alignItems: 'center' }}>
                  <input
                    value={mat.description}
                    onChange={e => updateMaterial(idx, midx, 'description', e.target.value)}
                    placeholder="Material (ej. Caja PVC 4x4x2)"
                    list="cable-calc-material-options"
                    style={{ flex: 1, fontSize: 12 }}
                  />
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
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginTop: 6, marginLeft: 20 }} onClick={() => addMaterial(idx)}>+ Material</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addSegment}>+ Agregar lado</button>
          <datalist id="cable-calc-material-options">
            {materialOptions.map(m => <option key={m} value={m} />)}
          </datalist>
        </div>

        {materialTotals.length > 0 && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11 }}>Título del grupo (en el estimado, estos materiales se combinan en una sola línea por área)</label>
              <input value={materialGroupTitle} onChange={e => setMaterialGroupTitle(e.target.value)} placeholder="Materiales de tubería" style={{ fontSize: 13 }} />
            </div>
            <p style={{ fontWeight: 700, color: 'var(--navy)', margin: '0 0 6px' }}>Materiales</p>
            {materialTotals.map(([desc, qty]) => (
              <div key={desc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{desc}</span><span style={{ fontWeight: 700 }}>{qty}</span>
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
          <button type="button" className="btn btn-primary" disabled={!description.trim() || boxesNeeded <= 0} onClick={handleAdd} style={{ flex: 1, justifyContent: 'center' }}>Agregar línea</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
