'use client';
import { useState } from 'react';

const DEFAULT_FEET_PER_UNIT = { cable: '1000', tubo: '10' };

export default function CableCalculator({ areaOptions = [], vendorOptions = [], onAdd, onClose }) {
  const [calcType, setCalcType] = useState('cable');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [runs, setRuns] = useState('');
  const [feetPerRun, setFeetPerRun] = useState('');
  const [feetPerBox, setFeetPerBox] = useState(DEFAULT_FEET_PER_UNIT.cable);
  const [pricePerBox, setPricePerBox] = useState('');

  const unitLabel = calcType === 'tubo' ? 'tubo' : 'caja';

  function handleTypeChange(type) {
    setCalcType(type);
    setFeetPerBox(DEFAULT_FEET_PER_UNIT[type]);
  }

  const totalFeet = (parseFloat(runs) || 0) * (parseFloat(feetPerRun) || 0);
  const boxesNeeded = feetPerBox > 0 ? Math.ceil(totalFeet / parseFloat(feetPerBox)) : 0;
  const total = boxesNeeded * (parseFloat(pricePerBox) || 0);

  function handleAdd() {
    if (!description.trim() || boxesNeeded <= 0) return;
    onAdd({
      description: `${description.trim()} — ${boxesNeeded} ${unitLabel}(s) (${totalFeet} pies)`,
      area: area.trim() || '',
      vendor: vendor.trim() || '',
      quantity: boxesNeeded,
      unit_price: parseFloat(pricePerBox) || 0,
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420 }}>
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

        <div className="form-row" style={{ marginBottom: 12 }}>
          <div className="form-group">
            <label>Cantidad de corridas</label>
            <input type="number" value={runs} onChange={e => setRuns(e.target.value)} min="0" step="1" />
          </div>
          <div className="form-group">
            <label>Pies por corrida</label>
            <input type="number" value={feetPerRun} onChange={e => setFeetPerRun(e.target.value)} min="0" step="0.1" />
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>Pies por {unitLabel}</label>
            <input type="number" value={feetPerBox} onChange={e => setFeetPerBox(e.target.value)} min="0" step="1" placeholder={DEFAULT_FEET_PER_UNIT[calcType]} />
          </div>
          <div className="form-group">
            <label>Precio por {unitLabel}</label>
            <input type="number" value={pricePerBox} onChange={e => setPricePerBox(e.target.value)} min="0" step="0.01" />
          </div>
        </div>

        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Pies totales</span><span style={{ fontWeight: 700 }}>{totalFeet}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>{calcType === 'tubo' ? 'Tubos necesarios' : 'Cajas necesarias'}</span><span style={{ fontWeight: 700 }}>{boxesNeeded}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--navy)' }}>
            <span>Total</span><span>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
