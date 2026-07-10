'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { EQUIPMENT_TYPES, getEquipmentType, EquipmentIcon } from '../../equipmentIcons';
import { exportEquipmentListCSV } from '../../planoEquipmentCsv';

const FALLBACK_W = 1600;
const FALLBACK_H = 1200;

export default function PlanoEditor({ plan, imageUrl, sourceUrl, initialMarkers, initialCables, customIcons, currentRole }) {
  const router = useRouter();
  const wrapRef = useRef(null);

  const W = plan.image_width || FALLBACK_W;
  const H = plan.image_height || FALLBACK_H;
  const iconSize = Math.max(W, H) * 0.035;

  const [planState, setPlanState] = useState(plan);
  const [markers, setMarkers] = useState(initialMarkers);
  const [cables, setCables] = useState(initialCables);
  const [customIconsState, setCustomIconsState] = useState(customIcons);
  const [mode, setMode] = useState('select'); // 'select' | { type: 'place', equipmentKey, customIconId } | { type: 'cable' } | { type: 'scale' }
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [selectedCableId, setSelectedCableId] = useState(null);
  const [cableDraft, setCableDraft] = useState(null); // { fromMarkerId, points: [{x,y}] }
  const [pointerPos, setPointerPos] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [showIconUpload, setShowIconUpload] = useState(false);
  const [iconName, setIconName] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scaleClickA, setScaleClickA] = useState(null); // first calibration point, awaiting second click
  const [scalePending, setScalePending] = useState(null); // { a, b } awaiting the feet input
  const [scaleFeetInput, setScaleFeetInput] = useState('');
  const [savingScale, setSavingScale] = useState(false);

  const canDeletePlan = currentRole === 'admin' || currentRole === 'secretaria';

  function resetTransientModes() {
    setCableDraft(null);
    setMode('select');
    setSelectedMarkerId(null);
    setSelectedCableId(null);
    setScaleClickA(null);
    setScalePending(null);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') resetTransientModes();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function dist(p1, p2) {
    return Math.hypot((p2.x - p1.x) * W, (p2.y - p1.y) * H);
  }

  const feetPerPixel = planState.scale_points && planState.scale_distance_ft
    ? planState.scale_distance_ft / dist(planState.scale_points[0], planState.scale_points[1])
    : null;

  function cableLengthFeet(cable) {
    if (!feetPerPixel) return null;
    const from = markerById(cable.from_marker_id);
    const to = markerById(cable.to_marker_id);
    if (!from || !to) return null;
    const pts = [{ x: from.pos_x, y: from.pos_y }, ...(cable.bend_points || []), { x: to.pos_x, y: to.pos_y }];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1]);
    return total * feetPerPixel;
  }

  async function saveScale(e) {
    e.preventDefault();
    const feet = parseFloat(scaleFeetInput);
    if (!scalePending || !feet || feet <= 0) return;
    setSavingScale(true);
    const points = [scalePending.a, scalePending.b];
    const { error } = await supabase.from('floor_plans').update({ scale_points: points, scale_distance_ft: feet }).eq('id', plan.id);
    setSavingScale(false);
    if (error) { alert('No se pudo guardar la escala: ' + error.message); return; }
    setPlanState(prev => ({ ...prev, scale_points: points, scale_distance_ft: feet }));
    setScalePending(null);
    setScaleFeetInput('');
    setMode('select');
  }

  async function clearScale() {
    if (!confirm('¿Borrar la escala definida para este plano?')) return;
    const { error } = await supabase.from('floor_plans').update({ scale_points: null, scale_distance_ft: null }).eq('id', plan.id);
    if (error) { alert('No se pudo borrar la escala: ' + error.message); return; }
    setPlanState(prev => ({ ...prev, scale_points: null, scale_distance_ft: null }));
  }

  function getPoint(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const fx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x: fx, y: fy };
  }

  async function placeMarker(point) {
    if (mode.type !== 'place') return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = {
      id: tempId, floor_plan_id: plan.id, equipment_type: mode.equipmentKey,
      custom_icon_id: mode.customIconId || null, label: null,
      pos_x: point.x, pos_y: point.y, sort_order: markers.length,
    };
    setMarkers(prev => [...prev, optimistic]);
    const { data, error } = await supabase.from('floor_plan_markers').insert([{
      floor_plan_id: plan.id, equipment_type: mode.equipmentKey,
      custom_icon_id: mode.customIconId || null, pos_x: point.x, pos_y: point.y,
      sort_order: markers.length,
    }]).select().single();
    if (error) {
      setMarkers(prev => prev.filter(m => m.id !== tempId));
      alert('No se pudo colocar el equipo: ' + error.message);
      return;
    }
    setMarkers(prev => prev.map(m => m.id === tempId ? data : m));
  }

  async function finalizeCable(toMarkerId) {
    if (!cableDraft || cableDraft.fromMarkerId === toMarkerId) return;
    const { data, error } = await supabase.from('floor_plan_cables').insert([{
      floor_plan_id: plan.id, from_marker_id: cableDraft.fromMarkerId, to_marker_id: toMarkerId,
      bend_points: cableDraft.points,
    }]).select().single();
    setCableDraft(null);
    if (error) { alert('No se pudo trazar el cable: ' + error.message); return; }
    setCables(prev => [...prev, data]);
  }

  function handleCanvasClick(e) {
    const point = getPoint(e);
    if (mode !== 'select' && mode.type === 'place') {
      placeMarker(point);
    } else if (mode !== 'select' && mode.type === 'cable' && cableDraft) {
      setCableDraft(prev => ({ ...prev, points: [...prev.points, point] }));
    } else if (mode !== 'select' && mode.type === 'scale') {
      if (scalePending) return;
      if (!scaleClickA) setScaleClickA(point);
      else { setScalePending({ a: scaleClickA, b: point }); setScaleClickA(null); }
    } else if (mode === 'select') {
      setSelectedMarkerId(null);
      setSelectedCableId(null);
    }
  }

  function handleMarkerClick(e, marker) {
    e.stopPropagation();
    if (mode !== 'select' && mode.type === 'cable') {
      if (!cableDraft) setCableDraft({ fromMarkerId: marker.id, points: [] });
      else finalizeCable(marker.id);
    } else if (mode === 'select') {
      setSelectedMarkerId(marker.id);
      setSelectedCableId(null);
    }
  }

  function handleMarkerPointerDown(e, marker) {
    e.stopPropagation();
    if (mode === 'select') setDraggingId(marker.id);
  }

  function handleWrapPointerMove(e) {
    if (draggingId) {
      const point = getPoint(e);
      setMarkers(prev => prev.map(m => m.id === draggingId ? { ...m, pos_x: point.x, pos_y: point.y } : m));
    } else if (mode !== 'select' && mode.type === 'cable' && cableDraft) {
      setPointerPos(getPoint(e));
    } else if (mode !== 'select' && mode.type === 'scale' && scaleClickA && !scalePending) {
      setPointerPos(getPoint(e));
    }
  }

  async function handleWrapPointerUp() {
    if (draggingId) {
      const m = markers.find(m => m.id === draggingId);
      setDraggingId(null);
      if (m && !String(m.id).startsWith('temp-')) {
        await supabase.from('floor_plan_markers').update({ pos_x: m.pos_x, pos_y: m.pos_y }).eq('id', m.id);
      }
    }
  }

  async function deleteMarker(id) {
    if (!confirm('¿Eliminar este equipo del plano? También se eliminarán sus cables.')) return;
    setMarkers(prev => prev.filter(m => m.id !== id));
    setCables(prev => prev.filter(c => c.from_marker_id !== id && c.to_marker_id !== id));
    setSelectedMarkerId(null);
    await supabase.from('floor_plan_markers').delete().eq('id', id);
  }

  async function updateMarkerLabel(id, label) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, label } : m));
  }
  async function commitMarkerLabel(id, label) {
    await supabase.from('floor_plan_markers').update({ label: label || null }).eq('id', id);
  }

  async function deleteCable(id) {
    if (!confirm('¿Eliminar este cable?')) return;
    setCables(prev => prev.filter(c => c.id !== id));
    setSelectedCableId(null);
    await supabase.from('floor_plan_cables').delete().eq('id', id);
  }

  async function handleIconUpload(e) {
    e.preventDefault();
    if (!iconName.trim() || !iconFile) return;
    setUploadingIcon(true);
    const id = crypto.randomUUID();
    const ext = iconFile.name.split('.').pop() || 'png';
    const path = `${id}/icon.${ext}`;
    const { error: upErr } = await supabase.storage.from('floor-plan-icons').upload(path, iconFile);
    if (upErr) { alert('No se pudo subir el ícono: ' + upErr.message); setUploadingIcon(false); return; }
    const { data: row, error: insErr } = await supabase.from('custom_equipment_icons')
      .insert([{ id, name: iconName.trim(), image_path: path }]).select().single();
    setUploadingIcon(false);
    if (insErr) { alert('No se pudo guardar el ícono: ' + insErr.message); return; }
    const { data: signed } = await supabase.storage.from('floor-plan-icons').createSignedUrl(path, 3600);
    setCustomIconsState(prev => [...prev, { ...row, url: signed?.signedUrl ?? null }]);
    setIconName(''); setIconFile(null); setShowIconUpload(false);
  }

  async function handleDeletePlan() {
    if (!confirm(`¿Eliminar el plano "${plan.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    const { error } = await supabase.from('floor_plans').delete().eq('id', plan.id);
    if (error) { alert('No se pudo eliminar el plano: ' + error.message); setDeleting(false); return; }
    router.push('/planos');
  }

  const markerById = id => markers.find(m => m.id === id);
  const selectedMarker = selectedMarkerId ? markerById(selectedMarkerId) : null;
  const selectedCable = selectedCableId ? cables.find(c => c.id === selectedCableId) : null;

  const counts = [];
  for (const t of EQUIPMENT_TYPES) {
    const n = markers.filter(m => m.equipment_type === t.key).length;
    if (n > 0) counts.push({ key: t.key, label: t.label, count: n });
  }
  for (const ic of customIconsState) {
    const n = markers.filter(m => m.custom_icon_id === ic.id).length;
    if (n > 0) counts.push({ key: ic.id, label: ic.name, count: n });
  }
  const totalEquipment = markers.length;
  const totalCables = cables.length;

  function cablePoints(cable) {
    const from = markerById(cable.from_marker_id);
    const to = markerById(cable.to_marker_id);
    if (!from || !to) return null;
    const pts = [{ x: from.pos_x, y: from.pos_y }, ...(cable.bend_points || []), { x: to.pos_x, y: to.pos_y }];
    return pts.map(p => `${p.x * W},${p.y * H}`).join(' ');
  }

  function draftPoints() {
    if (!cableDraft) return null;
    const from = markerById(cableDraft.fromMarkerId);
    if (!from) return null;
    const pts = [{ x: from.pos_x, y: from.pos_y }, ...cableDraft.points];
    if (pointerPos) pts.push(pointerPos);
    return pts.map(p => `${p.x * W},${p.y * H}`).join(' ');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{plan.name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {plan.clients?.name || plan.jobs?.title || 'Sin asignar'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Ver original</a>}
          <button className="btn btn-ghost" onClick={() => exportEquipmentListCSV(markers, EQUIPMENT_TYPES, customIconsState, cables, feetPerPixel, cableLengthFeet, plan.name)}>⬇️ Exportar lista</button>
          {canDeletePlan && <button className="btn btn-ghost" disabled={deleting} onClick={handleDeletePlan} style={{ color: 'var(--warn)' }}>Eliminar plano</button>}
          <Link href="/planos" className="btn btn-ghost">← Volver</Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
        <button
          onClick={() => { setMode('select'); setCableDraft(null); }}
          className="btn btn-ghost"
          style={{ fontWeight: 700, background: mode === 'select' ? 'var(--navy)' : undefined, color: mode === 'select' ? '#fff' : undefined }}
        >
          🖱️ Seleccionar
        </button>
        {EQUIPMENT_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setMode({ type: 'place', equipmentKey: t.key, customIconId: null })}
            className="btn btn-ghost"
            title={t.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: mode !== 'select' && mode.type === 'place' && mode.equipmentKey === t.key ? '#e8eeff' : undefined,
              border: mode !== 'select' && mode.type === 'place' && mode.equipmentKey === t.key ? `1.5px solid ${t.color}` : undefined,
            }}
          >
            <EquipmentIcon typeKey={t.key} size={16} /> {t.label}
          </button>
        ))}
        {customIconsState.map(ic => (
          <button
            key={ic.id}
            onClick={() => setMode({ type: 'place', equipmentKey: 'custom', customIconId: ic.id })}
            className="btn btn-ghost"
            title={ic.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: mode !== 'select' && mode.type === 'place' && mode.customIconId === ic.id ? '#e8eeff' : undefined,
            }}
          >
            {ic.url && <img src={ic.url} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />} {ic.name}
          </button>
        ))}
        <button
          onClick={() => { setMode({ type: 'cable' }); setCableDraft(null); }}
          className="btn btn-ghost"
          style={{ background: mode !== 'select' && mode.type === 'cable' ? '#fff3e0' : undefined, border: mode !== 'select' && mode.type === 'cable' ? '1.5px solid var(--amber)' : undefined }}
        >
          🔌 Cable
        </button>
        <button className="btn btn-ghost" onClick={() => setShowIconUpload(s => !s)}>+ Importar ícono</button>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
        <button
          onClick={() => { setMode({ type: 'scale' }); setScaleClickA(null); setScalePending(null); }}
          className="btn btn-ghost"
          style={{ background: mode !== 'select' && mode.type === 'scale' ? '#e8f5ee' : undefined, border: mode !== 'select' && mode.type === 'scale' ? '1.5px solid #1a7a4a' : undefined }}
        >
          📏 Escala {feetPerPixel ? '✓' : ''}
        </button>
      </div>

      {mode !== 'select' && mode.type === 'cable' && (
        <div className="card" style={{ padding: '8px 14px', fontSize: 13, background: '#fff3e0' }}>
          {!cableDraft
            ? 'Clic en el equipo donde inicia el cable.'
            : 'Clic en el plano para agregar quiebres, o clic en el equipo destino para terminar. Esc para cancelar.'}
        </div>
      )}

      {mode !== 'select' && mode.type === 'scale' && !scalePending && (
        <div className="card" style={{ padding: '8px 14px', fontSize: 13, background: '#e8f5ee' }}>
          {!scaleClickA
            ? 'Clic en el primer punto de una distancia conocida en el plano (ej: el ancho de una puerta).'
            : 'Clic en el segundo punto de esa distancia. Esc para cancelar.'}
        </div>
      )}

      {scalePending && (
        <form onSubmit={saveScale} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12, background: '#e8f5ee' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>¿Cuántos pies hay entre esos dos puntos?</span>
          <input
            autoFocus type="number" step="0.1" min="0.1" value={scaleFeetInput}
            onChange={e => setScaleFeetInput(e.target.value)}
            placeholder="Ej: 3 (ancho de puerta)"
            style={{ width: 160 }}
          />
          <button type="submit" className="btn btn-primary" disabled={savingScale || !scaleFeetInput}>
            {savingScale ? 'Guardando...' : 'Guardar escala'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setScalePending(null); setScaleFeetInput(''); }}>Cancelar</button>
        </form>
      )}

      {showIconUpload && (
        <form onSubmit={handleIconUpload} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12 }}>
          <input value={iconName} onChange={e => setIconName(e.target.value)} placeholder="Nombre del equipo (ej: Cámara PTZ Hikvision)" style={{ flex: 1, minWidth: 220 }} />
          <input type="file" accept="image/*" onChange={e => setIconFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn btn-primary" disabled={uploadingIcon || !iconName.trim() || !iconFile}>
            {uploadingIcon ? 'Subiendo...' : 'Subir ícono'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Canvas */}
        <div
          ref={wrapRef}
          onClick={handleCanvasClick}
          onPointerMove={handleWrapPointerMove}
          onPointerUp={handleWrapPointerUp}
          style={{
            position: 'relative', flex: '1 1 600px', minWidth: 320,
            aspectRatio: `${W} / ${H}`, background: '#f3f4f6',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden',
            cursor: mode !== 'select' ? 'crosshair' : 'default',
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
            {imageUrl && <image href={imageUrl} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid meet" />}

            {cables.map(c => {
              const pts = cablePoints(c);
              if (!pts) return null;
              const from = markerById(c.from_marker_id);
              const to = markerById(c.to_marker_id);
              const midX = ((from.pos_x + to.pos_x) / 2) * W;
              const midY = ((from.pos_y + to.pos_y) / 2) * H;
              const feet = cableLengthFeet(c);
              return (
                <g key={c.id}>
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={selectedCableId === c.id ? 'var(--amber)' : '#2a4cb5'}
                    strokeWidth={selectedCableId === c.id ? W * 0.004 : W * 0.0025}
                    style={{ cursor: mode === 'select' ? 'pointer' : 'default' }}
                    onClick={e => { if (mode === 'select') { e.stopPropagation(); setSelectedCableId(c.id); setSelectedMarkerId(null); } }}
                  />
                  {feet != null && (
                    <text x={midX} y={midY} textAnchor="middle" dy={-iconSize * 0.15}
                      style={{ fontSize: iconSize * 0.4, fontWeight: 700, fill: '#2a4cb5', paintOrder: 'stroke', stroke: '#fff', strokeWidth: iconSize * 0.08 }}>
                      {feet.toFixed(1)} pies
                    </text>
                  )}
                </g>
              );
            })}

            {cableDraft && (
              <polyline points={draftPoints()} fill="none" stroke="var(--amber)" strokeWidth={W * 0.0025} strokeDasharray={`${W * 0.006},${W * 0.004}`} />
            )}

            {planState.scale_points && (
              <g opacity={mode !== 'select' && mode.type === 'scale' ? 1 : 0.35}>
                <polyline
                  points={planState.scale_points.map(p => `${p.x * W},${p.y * H}`).join(' ')}
                  fill="none" stroke="#1a7a4a" strokeWidth={W * 0.002} strokeDasharray={`${W * 0.004},${W * 0.003}`}
                />
                {planState.scale_points.map((p, i) => (
                  <circle key={i} cx={p.x * W} cy={p.y * H} r={iconSize * 0.12} fill="#1a7a4a" />
                ))}
              </g>
            )}

            {scaleClickA && (
              <>
                <circle cx={scaleClickA.x * W} cy={scaleClickA.y * H} r={iconSize * 0.15} fill="#1a7a4a" />
                {pointerPos && (
                  <polyline
                    points={`${scaleClickA.x * W},${scaleClickA.y * H} ${pointerPos.x * W},${pointerPos.y * H}`}
                    fill="none" stroke="#1a7a4a" strokeWidth={W * 0.0025} strokeDasharray={`${W * 0.005},${W * 0.0035}`}
                  />
                )}
              </>
            )}

            {markers.map(m => {
              const cx = m.pos_x * W, cy = m.pos_y * H;
              const customIcon = m.custom_icon_id ? customIconsState.find(ic => ic.id === m.custom_icon_id) : null;
              const isSelected = selectedMarkerId === m.id;
              return (
                <g
                  key={m.id}
                  transform={`translate(${cx}, ${cy})`}
                  onClick={e => handleMarkerClick(e, m)}
                  onPointerDown={e => handleMarkerPointerDown(e, m)}
                  style={{ cursor: mode === 'select' ? 'grab' : 'pointer' }}
                >
                  <circle r={iconSize * 0.75} fill="#fff" stroke={isSelected ? 'var(--amber)' : '#c7cbd4'} strokeWidth={isSelected ? iconSize * 0.08 : iconSize * 0.04} />
                  {customIcon?.url ? (
                    <image href={customIcon.url} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} preserveAspectRatio="xMidYMid meet" />
                  ) : (
                    <svg x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={getEquipmentType(m.equipment_type)?.color || '#16223d'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {getEquipmentType(m.equipment_type)?.icon}
                    </svg>
                  )}
                </g>
              );
            })}
          </svg>

          {selectedMarker && (
            <div style={{
              position: 'absolute', left: `${selectedMarker.pos_x * 100}%`, top: `${selectedMarker.pos_y * 100}%`,
              transform: 'translate(16px, -50%)', background: '#fff', border: '1.5px solid var(--border)',
              borderRadius: 8, padding: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 5, width: 220,
            }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                {customIconsState.find(ic => ic.id === selectedMarker.custom_icon_id)?.name || getEquipmentType(selectedMarker.equipment_type)?.label}
              </div>
              <input
                value={selectedMarker.label || ''}
                onChange={e => updateMarkerLabel(selectedMarker.id, e.target.value)}
                onBlur={e => commitMarkerLabel(selectedMarker.id, e.target.value)}
                placeholder="Etiqueta (ej: Cam 3 - Entrada)"
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', flex: 1 }}
                  onClick={() => { setMode({ type: 'cable' }); setCableDraft({ fromMarkerId: selectedMarker.id, points: [] }); setSelectedMarkerId(null); }}>
                  🔌 Cable
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--warn)' }} onClick={() => deleteMarker(selectedMarker.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          )}

          {selectedCable && (
            <div style={{ position: 'absolute', right: 10, bottom: 10, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, padding: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 5 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                {cableLengthFeet(selectedCable) != null ? `${cableLengthFeet(selectedCable).toFixed(1)} pies` : 'Sin escala definida'}
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--warn)' }} onClick={() => deleteCable(selectedCable.id)}>
                Eliminar cable
              </button>
            </div>
          )}
        </div>

        {/* Summary panel */}
        <div className="card" style={{ flex: '0 0 260px', minWidth: 220 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>Resumen de equipos</p>
          {counts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Coloca equipos en el plano para ver el resumen aquí.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {counts.map(c => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800 }}>
            <span>Total equipos</span>
            <span>{totalEquipment}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            <span>Cables trazados</span>
            <span>{totalCables}</span>
          </div>
          {feetPerPixel && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 4, color: '#1a7a4a' }}>
              <span>Pietaje total</span>
              <span>{cables.reduce((sum, c) => sum + (cableLengthFeet(c) || 0), 0).toFixed(1)} pies</span>
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '8px 0' }} />
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {feetPerPixel ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Escala definida ✓</span>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={clearScale}>Borrar</button>
              </div>
            ) : (
              <span>Sin escala — el pietaje de los cables no se puede calcular. Usa el botón 📏 Escala.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
