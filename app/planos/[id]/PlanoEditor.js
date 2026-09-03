'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from '../../../lib/supabase';
import { getEquipmentType, getElementIcon } from '../../equipmentIcons';
import { exportEquipmentListCSV } from '../../planoEquipmentCsv';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';
import AOCCone from './AOCCone';
import AOCPanel from './AOCPanel';
import AddElementPanel from './AddElementPanel';
import CatalogItemPicker, { catalogItemLabel } from './CatalogItemPicker';

const FALLBACK_W = 1600;
const FALLBACK_H = 1200;

const URL_REFRESH_INTERVAL = 45 * 60 * 1000; // signed URLs expire at 1h; refresh well before that

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;
const WHEEL_ZOOM_INTENSITY = 0.0018;

const LAYER_COLORS = ['#2a4cb5', '#1a7a4a', '#e0972c', '#8e44ad', '#c0392b', '#0891b2', '#4b5563'];
const NO_LAYER = '__none__';

// Markers placed before the "Add Element" catalog existed (migrations/2026-07-16b-element-catalog.sql)
// have no element_id — this is the fallback set for gating their AOC cone.
const LEGACY_AOC_TYPES = new Set(['camera', 'access_point', 'motion_sensor']);

function getMarkerElement(marker, elementTypes) {
  return marker.element_id ? elementTypes.find(et => et.id === marker.element_id) : null;
}

function getMarkerColor(marker, elementTypes) {
  return getMarkerElement(marker, elementTypes)?.system_color || getEquipmentType(marker.equipment_type)?.color || '#16223d';
}

function supportsAOC(marker, elementTypes) {
  const element = getMarkerElement(marker, elementTypes);
  return element ? !!element.supports_aoc : LEGACY_AOC_TYPES.has(marker.equipment_type);
}

function getAOC(marker, elementTypes) {
  const systemColor = getMarkerColor(marker, elementTypes) || '#e0972c';
  return {
    visible: marker.aoc_visible ?? false,
    direction: marker.aoc_direction ?? 0,
    angle: marker.aoc_angle ?? 60,
    radius: marker.aoc_radius ?? 80,
    color: marker.aoc_color ?? systemColor,
    opacity: marker.aoc_opacity ?? 0.5,
  };
}

export default function PlanoEditor({ plan, imageUrl, sourceUrl, initialMarkers, initialAccessories = [], initialCables, initialLayers, initialCableTypes, initialElementTypes, customIcons, catalogProducts = [], currentRole, allClients = [] }) {
  const router = useRouter();
  const t = useTranslations('planos.editor');
  const tEquipmentCsv = useTranslations('shared.planoEquipmentCsv');
  const tEquipmentTypes = useTranslations('shared.equipmentTypes');
  const wrapRef = useRef(null);
  const dragOriginRef = useRef(null);
  const labelOriginRef = useRef(null);
  const modelOriginRef = useRef(null);
  const serialOriginRef = useRef(null);
  const notesOriginRef = useRef(null);
  const cableFeetOriginRef = useRef(null);
  const layerNameOriginRef = useRef(null);
  const cableTypeNameOriginRef = useRef(null);
  const cableLabelOriginRef = useRef(null);
  const cableDescriptionOriginRef = useRef(null);
  const customIconsRef = useRef(customIcons);

  const elementTypes = initialElementTypes || [];

  const W = plan.image_width || FALLBACK_W;
  const H = plan.image_height || FALLBACK_H;
  const iconSize = Math.max(W, H) * 0.022;

  const [planState, setPlanState] = useState(plan);
  const [markers, setMarkers] = useState(initialMarkers);
  const [accessories, setAccessories] = useState(initialAccessories);
  const [addingAccessory, setAddingAccessory] = useState(false);
  const [accessorySearch, setAccessorySearch] = useState('');
  const [accessoryOptions, setAccessoryOptions] = useState(null); // lazy: { catalog, recent } | null
  const [savingAccessory, setSavingAccessory] = useState(false);
  const [productSuggestions, setProductSuggestions] = useState(null); // lazy: elementId -> catalog item ids, most used first
  const [pickingPlaceProduct, setPickingPlaceProduct] = useState(false);
  const [pickingMarkerProduct, setPickingMarkerProduct] = useState(false);
  const [pickingPlaceCable, setPickingPlaceCable] = useState(false);
  const [cables, setCables] = useState(initialCables);
  const [layers, setLayers] = useState(initialLayers);
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [hiddenLayerIds, setHiddenLayerIds] = useState(() => new Set());
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [savingLayer, setSavingLayer] = useState(false);
  const [cableTypesState, setCableTypesState] = useState(initialCableTypes);
  const [activeCableTypeId, setActiveCableTypeId] = useState(null);
  const [showCableTypesPanel, setShowCableTypesPanel] = useState(false);
  const [newCableTypeName, setNewCableTypeName] = useState('');
  const [newCableTypeColor, setNewCableTypeColor] = useState('#2a4cb5');
  const [newCableTypeWidth, setNewCableTypeWidth] = useState(1);
  const [newCableTypeDash, setNewCableTypeDash] = useState('solid');
  const [savingCableType, setSavingCableType] = useState(false);
  const [customIconsState, setCustomIconsState] = useState(customIcons);
  const [imageUrlState, setImageUrlState] = useState(imageUrl);
  const [showAddElementPanel, setShowAddElementPanel] = useState(false);
  const [mode, setMode] = useState('select'); // 'select' | { type: 'place', elementId, customIconId } | { type: 'cable' } | { type: 'scale' }
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
  const [photoUrls, setPhotoUrls] = useState({}); // markerId -> signed url
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [editingLink, setEditingLink] = useState(false);
  const [linkClientId, setLinkClientId] = useState(plan.client_id || '');
  const [linkJobId, setLinkJobId] = useState(plan.job_id || '');
  const [linkJobs, setLinkJobs] = useState([]);
  const [savingLink, setSavingLink] = useState(false);
  const [linkDisplay, setLinkDisplay] = useState({ clientName: plan.clients?.name || null, jobTitle: plan.jobs?.title || null });
  const [view, setView] = useState({ zoom: MIN_ZOOM, pan: { x: 0, y: 0 } });
  const [rectSize, setRectSize] = useState({ width: 0, height: 0 });
  const panRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, startPan: { x: 0, y: 0 } });
  const suppressClickRef = useRef(false);
  const activePointersRef = useRef(new Map()); // touch pointerId -> {x, y}, for pinch-to-zoom
  const pinchRef = useRef(null); // { lastDist } while 2 touch pointers are down

  const canDeletePlan = currentRole === 'admin' || currentRole === 'secretaria';

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setRectSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  useEffect(() => { customIconsRef.current = customIconsState; }, [customIconsState]);

  // Don't carry a half-typed accessory over to the next equipment selected.
  useEffect(() => { setAddingAccessory(false); setAccessorySearch(''); setPickingMarkerProduct(false); }, [selectedMarkerId]);

  useEffect(() => {
    if (!linkClientId) { setLinkJobs([]); return; }
    supabase.from('jobs').select('id, title').eq('client_id', linkClientId).order('title').then(({ data }) => setLinkJobs(data ?? []));
  }, [linkClientId]);

  function startEditingLink() {
    setLinkClientId(plan.client_id || '');
    setLinkJobId(plan.job_id || '');
    setEditingLink(true);
  }

  async function saveLink() {
    setSavingLink(true);
    const { error } = await supabase.from('floor_plans').update({ client_id: linkClientId || null, job_id: linkJobId || null }).eq('id', plan.id);
    setSavingLink(false);
    if (error) { alert(t('errors.saveLinkFailed', { error: error.message })); return; }
    const clientName = allClients.find(c => c.id === linkClientId)?.name || null;
    const jobTitle = linkJobs.find(j => j.id === linkJobId)?.title || null;
    setLinkDisplay({ clientName, jobTitle });
    setEditingLink(false);
  }

  // Marker photos are fetched on demand (only when a marker with a photo is
  // selected) rather than signed up front for every marker on the plan.
  useEffect(() => {
    const marker = selectedMarkerId ? markers.find(m => m.id === selectedMarkerId) : null;
    if (marker?.photo_path && !photoUrls[marker.id]) {
      supabase.storage.from('floor-plan-icons').createSignedUrl(marker.photo_path, 3600).then(({ data }) => {
        if (data?.signedUrl) setPhotoUrls(prev => ({ ...prev, [marker.id]: data.signedUrl }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarkerId]);

  // Signed URLs (plan image + custom icons) expire after 1h. On a long
  // editing session that outlives the TTL, refresh them in the background
  // so the canvas doesn't silently go blank mid-session.
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: imgSigned } = await supabase.storage.from('floor-plans').createSignedUrl(plan.rendered_image_path, 3600);
      if (imgSigned?.signedUrl) setImageUrlState(imgSigned.signedUrl);

      const refreshed = await Promise.all(customIconsRef.current.map(async ic => {
        const { data } = await supabase.storage.from('floor-plan-icons').createSignedUrl(ic.image_path, 3600);
        return data?.signedUrl ? { ...ic, url: data.signedUrl } : ic;
      }));
      setCustomIconsState(refreshed);
    }, URL_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [plan.rendered_image_path]);

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
    if (error) { alert(t('errors.saveScaleFailed', { error: error.message })); return; }
    setPlanState(prev => ({ ...prev, scale_points: points, scale_distance_ft: feet }));
    setScalePending(null);
    setScaleFeetInput('');
    setMode('select');
  }

  async function clearScale() {
    if (!confirm(t('confirms.clearScale'))) return;
    const { error } = await supabase.from('floor_plans').update({ scale_points: null, scale_distance_ft: null }).eq('id', plan.id);
    if (error) { alert(t('errors.clearScaleFailed', { error: error.message })); return; }
    setPlanState(prev => ({ ...prev, scale_points: null, scale_distance_ft: null }));
  }

  function getPoint(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const lx = (clientX - rect.left - view.pan.x) / view.zoom;
    const ly = (clientY - rect.top - view.pan.y) / view.zoom;
    const fx = Math.min(1, Math.max(0, lx / rect.width));
    const fy = Math.min(1, Math.max(0, ly / rect.height));
    return { x: fx, y: fy };
  }

  function clampPan(pan, zoom, rect) {
    const minX = rect.width * (1 - zoom);
    const minY = rect.height * (1 - zoom);
    return {
      x: Math.min(0, Math.max(minX, pan.x)),
      y: Math.min(0, Math.max(minY, pan.y)),
    };
  }

  function applyZoomAt(clientX, clientY, factor) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView(prev => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
      if (nextZoom === prev.zoom) return prev;
      if (nextZoom === MIN_ZOOM) return { zoom: MIN_ZOOM, pan: { x: 0, y: 0 } };
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const nextPan = {
        x: cx - (nextZoom / prev.zoom) * (cx - prev.pan.x),
        y: cy - (nextZoom / prev.zoom) * (cy - prev.pan.y),
      };
      return { zoom: nextZoom, pan: clampPan(nextPan, nextZoom, rect) };
    });
  }

  function zoomByButton(factor) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function resetZoom() {
    setView({ zoom: MIN_ZOOM, pan: { x: 0, y: 0 } });
  }

  function handleWheel(e) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY);
    applyZoomAt(e.clientX, e.clientY, factor);
  }

  function handleWrapPointerDown(e) {
    if (e.pointerType === 'touch') {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2) {
        panRef.current.dragging = false; // hand off from single-finger pan to pinch
        const [p1, p2] = [...activePointersRef.current.values()];
        pinchRef.current = { lastDist: Math.hypot(p1.x - p2.x, p1.y - p2.y) };
        return;
      }
    }
    if (activePointersRef.current.size >= 2) return; // a pinch is already in progress
    if (view.zoom <= MIN_ZOOM) return;
    panRef.current = { dragging: true, moved: false, startX: e.clientX, startY: e.clientY, startPan: view.pan };
  }

  async function placeMarker(point) {
    if (mode.type !== 'place') return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = {
      id: tempId, floor_plan_id: plan.id, element_id: mode.elementId || null,
      custom_icon_id: mode.customIconId || null, label: null, layer_id: activeLayerId,
      catalog_item_id: mode.catalogItemId || null,
      cable_type_id: mode.cableTypeId || null, cable_feet: mode.cableFeet || null,
      pos_x: point.x, pos_y: point.y, sort_order: markers.length, quantity: 1,
    };
    setMarkers(prev => [...prev, optimistic]);
    const { data, error } = await supabase.from('floor_plan_markers').insert([{
      floor_plan_id: plan.id, element_id: mode.elementId || null,
      custom_icon_id: mode.customIconId || null, pos_x: point.x, pos_y: point.y,
      sort_order: markers.length, layer_id: activeLayerId,
      catalog_item_id: mode.catalogItemId || null,
      cable_type_id: mode.cableTypeId || null, cable_feet: mode.cableFeet || null,
    }]).select().single();
    if (error) {
      setMarkers(prev => prev.filter(m => m.id !== tempId));
      alert(t('errors.placeMarkerFailed', { error: error.message }));
      return;
    }
    setMarkers(prev => prev.map(m => m.id === tempId ? data : m));
  }

  async function finalizeCable(toMarkerId) {
    if (!cableDraft || cableDraft.fromMarkerId === toMarkerId) return;
    const { data, error } = await supabase.from('floor_plan_cables').insert([{
      floor_plan_id: plan.id, from_marker_id: cableDraft.fromMarkerId, to_marker_id: toMarkerId,
      bend_points: cableDraft.points, layer_id: activeLayerId, cable_type_id: activeCableTypeId,
    }]).select().single();
    setCableDraft(null);
    if (error) { alert(t('errors.createCableFailed', { error: error.message })); return; }
    setCables(prev => [...prev, data]);
  }

  function handleCanvasClick(e) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
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
    } else {
      // Any other mode (select, place, scale) — clicking directly on an
      // existing marker always opens it for editing. Otherwise, if you'd
      // just placed an icon (mode stays 'place'), clicking a different
      // existing icon did nothing, since only 'select'/'cable' were handled.
      setMode('select');
      setSelectedMarkerId(marker.id);
      setSelectedCableId(null);
    }
  }

  function handleMarkerPointerDown(e, marker) {
    e.stopPropagation();
    if (mode === 'select') {
      dragOriginRef.current = { id: marker.id, pos_x: marker.pos_x, pos_y: marker.pos_y };
      setDraggingId(marker.id);
    }
  }

  function handleWrapPointerMove(e) {
    if (e.pointerType === 'touch' && activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && activePointersRef.current.size === 2) {
      const [p1, p2] = [...activePointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const factor = dist / pinchRef.current.lastDist;
      pinchRef.current.lastDist = dist;
      applyZoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, factor);
      return;
    }
    if (panRef.current.dragging) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      if (!panRef.current.moved && Math.hypot(dx, dy) > 4) panRef.current.moved = true;
      if (panRef.current.moved) {
        const rect = wrapRef.current.getBoundingClientRect();
        setView(prev => ({ ...prev, pan: clampPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy }, prev.zoom, rect) }));
      }
      return;
    }
    if (draggingId) {
      const point = getPoint(e);
      setMarkers(prev => prev.map(m => m.id === draggingId ? { ...m, pos_x: point.x, pos_y: point.y } : m));
    } else if (mode !== 'select' && mode.type === 'cable' && cableDraft) {
      setPointerPos(getPoint(e));
    } else if (mode !== 'select' && mode.type === 'scale' && scaleClickA && !scalePending) {
      setPointerPos(getPoint(e));
    }
  }

  async function handleWrapPointerUp(e) {
    if (e && e.pointerType === 'touch') {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) pinchRef.current = null;
    }
    if (panRef.current.dragging) {
      if (panRef.current.moved) suppressClickRef.current = true;
      panRef.current.dragging = false;
      panRef.current.moved = false;
    }
    if (draggingId) {
      const m = markers.find(m => m.id === draggingId);
      const origin = dragOriginRef.current;
      setDraggingId(null);
      dragOriginRef.current = null;
      if (m && !String(m.id).startsWith('temp-')) {
        const { error } = await supabase.from('floor_plan_markers').update({ pos_x: m.pos_x, pos_y: m.pos_y }).eq('id', m.id);
        if (error && origin) {
          setMarkers(prev => prev.map(mk => mk.id === origin.id ? { ...mk, pos_x: origin.pos_x, pos_y: origin.pos_y } : mk));
          alert(t('errors.savePositionFailed', { error: error.message }));
        }
      }
    }
  }

  async function duplicateMarker(id) {
    const marker = markerById(id);
    if (!marker) return;
    const offset = 0.02;
    const newPos = { x: Math.min(0.98, marker.pos_x + offset), y: Math.min(0.98, marker.pos_y + offset) };
    const tempId = `temp-${crypto.randomUUID()}`;
    const clonedFields = {
      element_id: marker.element_id, custom_icon_id: marker.custom_icon_id, equipment_type: marker.equipment_type,
      model: marker.model, serial_number: marker.serial_number, notes: marker.notes, quantity: marker.quantity,
      catalog_item_id: marker.catalog_item_id,
      cable_type_id: marker.cable_type_id, cable_feet: marker.cable_feet,
      layer_id: marker.layer_id, icon_scale: marker.icon_scale, custom_color: marker.custom_color,
      aoc_visible: marker.aoc_visible, aoc_direction: marker.aoc_direction, aoc_angle: marker.aoc_angle,
      aoc_radius: marker.aoc_radius, aoc_color: marker.aoc_color, aoc_opacity: marker.aoc_opacity,
    };
    const optimistic = { ...marker, ...clonedFields, id: tempId, pos_x: newPos.x, pos_y: newPos.y, label: null, sort_order: markers.length };
    setMarkers(prev => [...prev, optimistic]);
    const { data, error } = await supabase.from('floor_plan_markers').insert([{
      floor_plan_id: plan.id, pos_x: newPos.x, pos_y: newPos.y, sort_order: markers.length, ...clonedFields,
    }]).select().single();
    if (error) {
      setMarkers(prev => prev.filter(m => m.id !== tempId));
      alert(t('errors.duplicateMarkerFailed', { error: error.message }));
      return;
    }
    setMarkers(prev => prev.map(m => m.id === tempId ? data : m));
    const sourceAccessories = markerAccessories(id);
    if (sourceAccessories.length) {
      const { data: cloned } = await supabase.from('floor_plan_marker_accessories').insert(
        sourceAccessories.map(a => ({
          marker_id: data.id, catalog_item_id: a.catalog_item_id, name: a.name,
          quantity: a.quantity, notes: a.notes, sort_order: a.sort_order,
        }))
      ).select();
      if (cloned?.length) setAccessories(prev => [...prev, ...cloned]);
    }
    setSelectedMarkerId(data.id);
  }

  async function deleteMarker(id) {
    if (!confirm(t('confirms.deleteMarker'))) return;
    const removedMarker = markers.find(m => m.id === id);
    const removedCables = cables.filter(c => c.from_marker_id === id || c.to_marker_id === id);
    const removedAccessories = accessories.filter(a => a.marker_id === id); // deleted in the DB by the FK cascade
    setMarkers(prev => prev.filter(m => m.id !== id));
    setCables(prev => prev.filter(c => c.from_marker_id !== id && c.to_marker_id !== id));
    setAccessories(prev => prev.filter(a => a.marker_id !== id));
    setSelectedMarkerId(null);
    const { error } = await supabase.from('floor_plan_markers').delete().eq('id', id);
    if (error) {
      if (removedMarker) setMarkers(prev => [...prev, removedMarker]);
      if (removedCables.length) setCables(prev => [...prev, ...removedCables]);
      if (removedAccessories.length) setAccessories(prev => [...prev, ...removedAccessories]);
      alert(t('errors.deleteMarkerFailed', { error: error.message }));
    }
  }

  function updateMarkerLabel(id, label) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, label } : m));
  }
  async function commitMarkerLabel(id, label) {
    const original = labelOriginRef.current;
    const { error } = await supabase.from('floor_plan_markers').update({ label: label || null }).eq('id', id);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === id ? { ...m, label: original ?? null } : m));
      alert(t('errors.saveLabelFailed', { error: error.message }));
    }
  }

  function adjustMarkerScale(id, delta) {
    const marker = markerById(id);
    const current = marker?.icon_scale ?? 1;
    const next = Math.min(2, Math.max(0.25, Math.round((current + delta) * 100) / 100));
    if (next === current) return;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, icon_scale: next } : m));
    supabase.from('floor_plan_markers').update({ icon_scale: next }).eq('id', id).then(({ error }) => {
      if (error) {
        setMarkers(prev => prev.map(m => m.id === id ? { ...m, icon_scale: current } : m));
        alert(t('errors.saveSizeFailed', { error: error.message }));
      }
    });
  }

  function updateMarkerColor(id, custom_color) {
    const original = markerById(id)?.custom_color ?? null;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, custom_color } : m));
    supabase.from('floor_plan_markers').update({ custom_color }).eq('id', id).then(({ error }) => {
      if (error) {
        setMarkers(prev => prev.map(m => m.id === id ? { ...m, custom_color: original } : m));
        alert(t('errors.markerColorFailed', { error: error.message }));
      }
    });
  }

  function updateMarkerModel(id, model) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, model } : m));
  }
  async function commitMarkerModel(id, model) {
    const original = modelOriginRef.current;
    const { error } = await supabase.from('floor_plan_markers').update({ model: model || null }).eq('id', id);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === id ? { ...m, model: original ?? null } : m));
      alert(t('errors.saveModelFailed', { error: error.message }));
    }
  }

  function updateMarkerSerial(id, serial_number) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, serial_number } : m));
  }
  async function commitMarkerSerial(id, serial_number) {
    const original = serialOriginRef.current;
    const { error } = await supabase.from('floor_plan_markers').update({ serial_number: serial_number || null }).eq('id', id);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === id ? { ...m, serial_number: original ?? null } : m));
      alert(t('errors.saveSerialFailed', { error: error.message }));
    }
  }

  function updateMarkerNotes(id, notes) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, notes } : m));
  }
  async function commitMarkerNotes(id, notes) {
    const original = notesOriginRef.current;
    const { error } = await supabase.from('floor_plan_markers').update({ notes: notes || null }).eq('id', id);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === id ? { ...m, notes: original ?? null } : m));
      alert(t('errors.saveNotesFailed', { error: error.message }));
    }
  }

  function adjustMarkerQuantity(id, delta) {
    const marker = markerById(id);
    const current = marker?.quantity ?? 1;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, quantity: next } : m));
    supabase.from('floor_plan_markers').update({ quantity: next }).eq('id', id).then(({ error }) => {
      if (error) {
        setMarkers(prev => prev.map(m => m.id === id ? { ...m, quantity: current } : m));
        alert(t('errors.saveQuantityFailed', { error: error.message }));
      }
    });
  }

  // ── Catalog product on a marker (migrations/2026-09-02b-marker-catalog-item.sql) ──
  const productById = id => (id ? catalogProducts.find(p => p.id === id) : null);

  // Which products people actually put on this kind of element, most used
  // first, read once from the markers already placed across every plan.
  async function loadProductSuggestions() {
    if (productSuggestions) return;
    const { data } = await supabase.from('floor_plan_markers')
      .select('element_id, catalog_item_id').not('catalog_item_id', 'is', null).limit(500);
    const byElement = new Map();
    for (const row of data ?? []) {
      if (!row.element_id) continue;
      if (!byElement.has(row.element_id)) byElement.set(row.element_id, new Map());
      const tally = byElement.get(row.element_id);
      tally.set(row.catalog_item_id, (tally.get(row.catalog_item_id) || 0) + 1);
    }
    setProductSuggestions(byElement);
  }

  function productSuggestionsFor(elementId) {
    const tally = elementId ? productSuggestions?.get(elementId) : null;
    if (!tally) return [];
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => productById(id))
      .filter(Boolean)
      .slice(0, 5);
  }

  async function setMarkerProduct(markerId, item) {
    const marker = markerById(markerId);
    const original = marker?.catalog_item_id ?? null;
    const next = item?.id ?? null;
    setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, catalog_item_id: next } : m));
    setPickingMarkerProduct(false);
    setProductSuggestions(null); // so "most used" picks this product up next time
    const { error } = await supabase.from('floor_plan_markers').update({ catalog_item_id: next }).eq('id', markerId);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, catalog_item_id: original } : m));
      alert(t('errors.saveProductFailed', { error: error.message }));
    }
  }

  // ── Cable estimated per equipment (migrations/2026-09-02c-marker-cable.sql) ──
  // Feet are per unit of the marker, so the totals multiply by its quantity.
  const cableTypeById = id => (id ? cableTypesState.find(ct => ct.id === id) : null);

  function updateMarkerCableType(id, cableTypeId) {
    const original = markerById(id)?.cable_type_id ?? null;
    const next = cableTypeId || null;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, cable_type_id: next } : m));
    supabase.from('floor_plan_markers').update({ cable_type_id: next }).eq('id', id).then(({ error }) => {
      if (error) {
        setMarkers(prev => prev.map(m => m.id === id ? { ...m, cable_type_id: original } : m));
        alert(t('errors.saveCableTypeFailed', { error: error.message }));
      }
    });
  }

  function updateMarkerCableFeet(id, cableFeet) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, cable_feet: cableFeet } : m));
  }
  async function commitMarkerCableFeet(id, cableFeet) {
    const original = cableFeetOriginRef.current;
    const parsed = cableFeet === '' || cableFeet == null ? null : parseFloat(cableFeet);
    const next = parsed != null && parsed > 0 ? parsed : null;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, cable_feet: next } : m));
    const { error } = await supabase.from('floor_plan_markers').update({ cable_feet: next }).eq('id', id);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === id ? { ...m, cable_feet: original ?? null } : m));
      alert(t('errors.saveCableFeetFailed', { error: error.message }));
    }
  }

  // ── Accessories (migrations/2026-09-02-marker-accessories.sql) ──────────
  // Child rows of a marker: the two-port faceplate a Network Jack needs, the
  // junction box a camera needs. Their quantity is per unit of the parent
  // marker, so the totals below multiply by the marker's own quantity.
  const markerAccessories = markerId => accessories.filter(a => a.marker_id === markerId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Loaded the first time the "+ accessory" form opens: the product catalog to
  // search, plus the accessory names already used on other plans, which is what
  // the tech reaches for most of the time.
  async function loadAccessoryOptions() {
    if (accessoryOptions) return;
    const { data: used } = await supabase.from('floor_plan_marker_accessories')
      .select('name, catalog_item_id').order('created_at', { ascending: false }).limit(200);
    const tally = new Map();
    for (const a of used ?? []) {
      const key = a.catalog_item_id || a.name;
      if (!tally.has(key)) tally.set(key, { name: a.name, catalog_item_id: a.catalog_item_id, count: 0 });
      tally.get(key).count += 1;
    }
    const recent = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    setAccessoryOptions({ catalog: catalogProducts, recent });
  }

  function openAccessoryForm() {
    setAddingAccessory(true);
    setAccessorySearch('');
    loadAccessoryOptions();
  }

  async function addAccessory(markerId, { name, catalogItemId = null }) {
    const clean = (name || '').trim();
    if (!clean || savingAccessory) return;
    setSavingAccessory(true);
    const sortOrder = markerAccessories(markerId).length;
    const { data, error } = await supabase.from('floor_plan_marker_accessories').insert([{
      marker_id: markerId, catalog_item_id: catalogItemId, name: clean, quantity: 1, sort_order: sortOrder,
    }]).select().single();
    setSavingAccessory(false);
    if (error) { alert(t('errors.addAccessoryFailed', { error: error.message })); return; }
    setAccessories(prev => [...prev, data]);
    setAccessorySearch('');
    setAddingAccessory(false);
    setAccessoryOptions(null); // so the "most used" list picks this one up next time
  }

  function adjustAccessoryQuantity(id, delta) {
    const accessory = accessories.find(a => a.id === id);
    if (!accessory) return;
    const current = accessory.quantity ?? 1;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    setAccessories(prev => prev.map(a => a.id === id ? { ...a, quantity: next } : a));
    supabase.from('floor_plan_marker_accessories').update({ quantity: next }).eq('id', id).then(({ error }) => {
      if (error) {
        setAccessories(prev => prev.map(a => a.id === id ? { ...a, quantity: current } : a));
        alert(t('errors.saveQuantityFailed', { error: error.message }));
      }
    });
  }

  async function deleteAccessory(id) {
    const removed = accessories.find(a => a.id === id);
    setAccessories(prev => prev.filter(a => a.id !== id));
    const { error } = await supabase.from('floor_plan_marker_accessories').delete().eq('id', id);
    if (error) {
      if (removed) setAccessories(prev => [...prev, removed]);
      alert(t('errors.deleteAccessoryFailed', { error: error.message }));
    }
  }

  async function handleMarkerPhotoUpload(markerId, file) {
    if (!file) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `marker-photos/${markerId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('floor-plan-icons').upload(path, file);
    if (upErr) { alert(t('errors.uploadPhotoFailed', { error: upErr.message })); setUploadingPhoto(false); return; }
    const { error: updErr } = await supabase.from('floor_plan_markers').update({ photo_path: path }).eq('id', markerId);
    setUploadingPhoto(false);
    if (updErr) { alert(t('errors.savePhotoFailed', { error: updErr.message })); return; }
    const { data: signed } = await supabase.storage.from('floor-plan-icons').createSignedUrl(path, 3600);
    setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, photo_path: path } : m));
    setPhotoUrls(prev => ({ ...prev, [markerId]: signed?.signedUrl ?? null }));
  }

  async function removeMarkerPhoto(markerId) {
    if (!confirm(t('confirms.removePhoto'))) return;
    const marker = markerById(markerId);
    const oldPath = marker?.photo_path;
    setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, photo_path: null } : m));
    setPhotoUrls(prev => { const next = { ...prev }; delete next[markerId]; return next; });
    const { error } = await supabase.from('floor_plan_markers').update({ photo_path: null }).eq('id', markerId);
    if (error) {
      setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, photo_path: oldPath } : m));
      alert(t('errors.removePhotoFailed', { error: error.message }));
      return;
    }
    if (oldPath) await supabase.storage.from('floor-plan-icons').remove([oldPath]);
  }

  async function handleAOCChange(markerId, updates) {
    const previous = markerById(markerId);
    setMarkers(prev => prev.map(m => {
      if (m.id !== markerId) return m;
      return {
        ...m,
        aoc_visible: updates.visible !== undefined ? updates.visible : m.aoc_visible,
        aoc_direction: updates.direction !== undefined ? updates.direction : m.aoc_direction,
        aoc_angle: updates.angle !== undefined ? updates.angle : m.aoc_angle,
        aoc_radius: updates.radius !== undefined ? updates.radius : m.aoc_radius,
        aoc_color: updates.color !== undefined ? updates.color : m.aoc_color,
        aoc_opacity: updates.opacity !== undefined ? updates.opacity : m.aoc_opacity,
      };
    }));

    const dbUpdates = {};
    if (updates.visible !== undefined) dbUpdates.aoc_visible = updates.visible;
    if (updates.direction !== undefined) dbUpdates.aoc_direction = updates.direction;
    if (updates.angle !== undefined) dbUpdates.aoc_angle = updates.angle;
    if (updates.radius !== undefined) dbUpdates.aoc_radius = updates.radius;
    if (updates.color !== undefined) dbUpdates.aoc_color = updates.color;
    if (updates.opacity !== undefined) dbUpdates.aoc_opacity = updates.opacity;

    const { error } = await supabase.from('floor_plan_markers').update(dbUpdates).eq('id', markerId);
    if (error && previous) {
      setMarkers(prev => prev.map(m => m.id === markerId ? previous : m));
      alert(t('errors.saveAOCFailed', { error: error.message }));
    }
  }

  async function deleteCable(id) {
    if (!confirm(t('confirms.deleteCable'))) return;
    const removedCable = cables.find(c => c.id === id);
    setCables(prev => prev.filter(c => c.id !== id));
    setSelectedCableId(null);
    const { error } = await supabase.from('floor_plan_cables').delete().eq('id', id);
    if (error) {
      if (removedCable) setCables(prev => [...prev, removedCable]);
      alert(t('errors.deleteCableFailed', { error: error.message }));
    }
  }

  async function createLayer(e) {
    e.preventDefault();
    if (!newLayerName.trim()) return;
    setSavingLayer(true);
    const color = LAYER_COLORS[layers.length % LAYER_COLORS.length];
    const { data, error } = await supabase.from('floor_plan_layers').insert([{
      floor_plan_id: plan.id, name: newLayerName.trim(), color, sort_order: layers.length,
    }]).select().single();
    setSavingLayer(false);
    if (error) { alert(t('errors.createLayerFailed', { error: error.message })); return; }
    setLayers(prev => [...prev, data]);
    setActiveLayerId(data.id);
    setNewLayerName('');
  }

  function updateLayerName(id, name) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, name } : l));
  }
  async function commitLayerName(id, name) {
    const original = layerNameOriginRef.current;
    if (!name.trim()) {
      setLayers(prev => prev.map(l => l.id === id ? { ...l, name: original ?? l.name } : l));
      return;
    }
    const { error } = await supabase.from('floor_plan_layers').update({ name: name.trim() }).eq('id', id);
    if (error) {
      setLayers(prev => prev.map(l => l.id === id ? { ...l, name: original ?? l.name } : l));
      alert(t('errors.renameLayerFailed', { error: error.message }));
    }
  }

  async function deleteLayer(id) {
    const layer = layers.find(l => l.id === id);
    if (!layer || !confirm(t('confirms.deleteLayer', { name: layer.name }))) return;
    setLayers(prev => prev.filter(l => l.id !== id));
    setMarkers(prev => prev.map(m => m.layer_id === id ? { ...m, layer_id: null } : m));
    setCables(prev => prev.map(c => c.layer_id === id ? { ...c, layer_id: null } : c));
    setHiddenLayerIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    if (activeLayerId === id) setActiveLayerId(null);
    const { error } = await supabase.from('floor_plan_layers').delete().eq('id', id);
    if (error) {
      setLayers(prev => [...prev, layer].sort((a, b) => a.sort_order - b.sort_order));
      alert(t('errors.deleteLayerFailed', { error: error.message }));
    }
  }

  async function moveLayer(id, direction) {
    const idx = layers.findIndex(l => l.id === id);
    const otherIdx = idx + direction;
    if (idx === -1 || otherIdx < 0 || otherIdx >= layers.length) return;
    const a = layers[idx], b = layers[otherIdx];
    const reordered = [...layers];
    reordered[idx] = { ...b, sort_order: a.sort_order };
    reordered[otherIdx] = { ...a, sort_order: b.sort_order };
    reordered.sort((x, y) => x.sort_order - y.sort_order);
    setLayers(reordered);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('floor_plan_layers').update({ sort_order: a.sort_order }).eq('id', b.id),
      supabase.from('floor_plan_layers').update({ sort_order: b.sort_order }).eq('id', a.id),
    ]);
    if (e1 || e2) {
      setLayers(layers);
      alert(t('errors.reorderLayerFailed'));
    }
  }

  function toggleLayerVisibility(id) {
    setHiddenLayerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function updateMarkerLayer(id, layerId) {
    const original = markerById(id)?.layer_id ?? null;
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, layer_id: layerId } : m));
    supabase.from('floor_plan_markers').update({ layer_id: layerId }).eq('id', id).then(({ error }) => {
      if (error) {
        setMarkers(prev => prev.map(m => m.id === id ? { ...m, layer_id: original } : m));
        alert(t('errors.changeLayerFailed', { error: error.message }));
      }
    });
  }

  function updateCableLayer(id, layerId) {
    const original = cables.find(c => c.id === id)?.layer_id ?? null;
    setCables(prev => prev.map(c => c.id === id ? { ...c, layer_id: layerId } : c));
    supabase.from('floor_plan_cables').update({ layer_id: layerId }).eq('id', id).then(({ error }) => {
      if (error) {
        setCables(prev => prev.map(c => c.id === id ? { ...c, layer_id: original } : c));
        alert(t('errors.changeLayerFailed', { error: error.message }));
      }
    });
  }

  // Path-tool catalog elements (Cable Path, Flex Cable Path — Infrastructure)
  // aren't placed as markers — they arm the same cable-drawing tool as the
  // 🔌 Cable button, switched to a cable type matching the element's own
  // name (pre-seeded by migrations/2026-07-16d-cable-path-type.sql for
  // Cable Path; created here as a fallback, and for any other path tool).
  async function armPathTool(element) {
    setMode({ type: 'cable' });
    setCableDraft(null);
    const existing = cableTypesState.find(ct => ct.name === element.name);
    if (existing) { setActiveCableTypeId(existing.id); return; }
    const { data, error } = await supabase.from('cable_types').insert([{ name: element.name, color: element.system_color }]).select().single();
    if (error) { alert(t('errors.prepareCableTypeFailed', { name: element.name, error: error.message })); return; }
    setCableTypesState(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveCableTypeId(data.id);
  }

  async function createCableType(e) {
    e.preventDefault();
    if (!newCableTypeName.trim()) return;
    setSavingCableType(true);
    const { data, error } = await supabase.from('cable_types').insert([{
      name: newCableTypeName.trim(), color: newCableTypeColor,
      line_width: newCableTypeWidth, dash_style: newCableTypeDash,
    }]).select().single();
    setSavingCableType(false);
    if (error) { alert(t('errors.createCableTypeFailed', { error: error.message })); return; }
    setCableTypesState(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveCableTypeId(data.id);
    setNewCableTypeName('');
    setNewCableTypeColor('#2a4cb5');
    setNewCableTypeWidth(1);
    setNewCableTypeDash('solid');
  }

  function updateCableTypeName(id, name) {
    setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, name } : ct));
  }
  async function commitCableTypeName(id, name) {
    const original = cableTypeNameOriginRef.current;
    if (!name.trim()) {
      setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, name: original ?? ct.name } : ct));
      return;
    }
    const { error } = await supabase.from('cable_types').update({ name: name.trim() }).eq('id', id);
    if (error) {
      setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, name: original ?? ct.name } : ct));
      alert(t('errors.renameCableTypeFailed', { error: error.message }));
    }
  }

  function updateCableTypeColor(id, color) {
    const original = cableTypesState.find(ct => ct.id === id)?.color;
    setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, color } : ct));
    supabase.from('cable_types').update({ color }).eq('id', id).then(({ error }) => {
      if (error) {
        setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, color: original } : ct));
        alert(t('errors.cableTypeColorFailed', { error: error.message }));
      }
    });
  }

  function updateCableTypeFeetPerBox(id, feetPerBox) {
    if (!feetPerBox || feetPerBox < 1) return;
    const original = cableTypesState.find(ct => ct.id === id)?.feet_per_box;
    setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, feet_per_box: feetPerBox } : ct));
    supabase.from('cable_types').update({ feet_per_box: feetPerBox }).eq('id', id).then(({ error }) => {
      if (error) {
        setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, feet_per_box: original } : ct));
        alert(t('errors.saveFeetPerBoxFailed', { error: error.message }));
      }
    });
  }

  function updateCableTypeWidth(id, lineWidth) {
    const original = cableTypesState.find(ct => ct.id === id)?.line_width;
    setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, line_width: lineWidth } : ct));
    supabase.from('cable_types').update({ line_width: lineWidth }).eq('id', id).then(({ error }) => {
      if (error) {
        setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, line_width: original } : ct));
        alert(t('errors.saveThicknessFailed', { error: error.message }));
      }
    });
  }

  function updateCableTypeDash(id, dashStyle) {
    const original = cableTypesState.find(ct => ct.id === id)?.dash_style;
    setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, dash_style: dashStyle } : ct));
    supabase.from('cable_types').update({ dash_style: dashStyle }).eq('id', id).then(({ error }) => {
      if (error) {
        setCableTypesState(prev => prev.map(ct => ct.id === id ? { ...ct, dash_style: original } : ct));
        alert(t('errors.saveDashFailed', { error: error.message }));
      }
    });
  }

  async function deleteCableType(id) {
    const type = cableTypesState.find(ct => ct.id === id);
    if (!type || !confirm(t('confirms.deleteCableType', { name: type.name }))) return;
    setCableTypesState(prev => prev.filter(ct => ct.id !== id));
    setCables(prev => prev.map(c => c.cable_type_id === id ? { ...c, cable_type_id: null } : c));
    if (activeCableTypeId === id) setActiveCableTypeId(null);
    const { error } = await supabase.from('cable_types').delete().eq('id', id);
    if (error) {
      setCableTypesState(prev => [...prev, type].sort((a, b) => a.name.localeCompare(b.name)));
      alert(t('errors.deleteCableTypeFailed', { error: error.message }));
    }
  }

  function updateCableLabel(id, label) {
    setCables(prev => prev.map(c => c.id === id ? { ...c, label } : c));
  }
  async function commitCableLabel(id, label) {
    const original = cableLabelOriginRef.current;
    const { error } = await supabase.from('floor_plan_cables').update({ label: label || null }).eq('id', id);
    if (error) {
      setCables(prev => prev.map(c => c.id === id ? { ...c, label: original ?? null } : c));
      alert(t('errors.saveCableLabelFailed', { error: error.message }));
    }
  }

  function updateCableDescription(id, description) {
    setCables(prev => prev.map(c => c.id === id ? { ...c, description } : c));
  }
  async function commitCableDescription(id, description) {
    const original = cableDescriptionOriginRef.current;
    const { error } = await supabase.from('floor_plan_cables').update({ description: description || null }).eq('id', id);
    if (error) {
      setCables(prev => prev.map(c => c.id === id ? { ...c, description: original ?? null } : c));
      alert(t('errors.saveCableDescriptionFailed', { error: error.message }));
    }
  }

  function updateCableType(id, cableTypeId) {
    const original = cables.find(c => c.id === id)?.cable_type_id ?? null;
    setCables(prev => prev.map(c => c.id === id ? { ...c, cable_type_id: cableTypeId } : c));
    supabase.from('floor_plan_cables').update({ cable_type_id: cableTypeId }).eq('id', id).then(({ error }) => {
      if (error) {
        setCables(prev => prev.map(c => c.id === id ? { ...c, cable_type_id: original } : c));
        alert(t('errors.changeCableTypeFailed', { error: error.message }));
      }
    });
  }

  async function handleIconUpload(e) {
    e.preventDefault();
    if (!iconName.trim() || !iconFile) return;
    setUploadingIcon(true);
    const id = crypto.randomUUID();
    const ext = iconFile.name.split('.').pop() || 'png';
    const path = `${id}/icon.${ext}`;
    const { error: upErr } = await supabase.storage.from('floor-plan-icons').upload(path, iconFile);
    if (upErr) { alert(t('errors.uploadIconFailed', { error: upErr.message })); setUploadingIcon(false); return; }
    const { data: row, error: insErr } = await supabase.from('custom_equipment_icons')
      .insert([{ id, name: iconName.trim(), image_path: path }]).select().single();
    setUploadingIcon(false);
    if (insErr) { alert(t('errors.saveIconFailed', { error: insErr.message })); return; }
    const { data: signed } = await supabase.storage.from('floor-plan-icons').createSignedUrl(path, 3600);
    setCustomIconsState(prev => [...prev, { ...row, url: signed?.signedUrl ?? null }]);
    setIconName(''); setIconFile(null); setShowIconUpload(false);
  }

  async function handleDeletePlan() {
    if (!confirm(t('confirms.deletePlan', { name: plan.name }))) return;
    setDeleting(true);
    const { error } = await supabase.from('floor_plans').delete().eq('id', plan.id);
    if (error) { alert(t('errors.deletePlanFailed', { error: error.message })); setDeleting(false); return; }
    router.push('/planos');
  }

  const markerById = id => markers.find(m => m.id === id);
  const selectedMarker = selectedMarkerId ? markerById(selectedMarkerId) : null;
  const selectedCable = selectedCableId ? cables.find(c => c.id === selectedCableId) : null;
  const selectedMarkerAOC = selectedMarker && supportsAOC(selectedMarker, elementTypes) ? getAOC(selectedMarker, elementTypes) : null;

  const isLayerVisible = layerId => !hiddenLayerIds.has(layerId || NO_LAYER);
  const visibleMarkers = markers.filter(m => isLayerVisible(m.layer_id));
  const visibleCables = cables.filter(c => isLayerVisible(c.layer_id));

  const counts = [];
  const elementQtyById = new Map(); // elementId -> { total, byProduct: Map(catalogItemId|null -> qty) }
  const legacyQtyByKey = new Map();
  for (const m of visibleMarkers) {
    const qty = m.quantity ?? 1;
    if (m.element_id) {
      if (!elementQtyById.has(m.element_id)) elementQtyById.set(m.element_id, { total: 0, byProduct: new Map() });
      const entry = elementQtyById.get(m.element_id);
      entry.total += qty;
      const productKey = m.catalog_item_id || null;
      entry.byProduct.set(productKey, (entry.byProduct.get(productKey) || 0) + qty);
    } else if (m.equipment_type) {
      legacyQtyByKey.set(m.equipment_type, (legacyQtyByKey.get(m.equipment_type) || 0) + qty);
    }
  }
  for (const [elementId, entry] of elementQtyById) {
    const el = elementTypes.find(et => et.id === elementId);
    if (!el) continue;
    // Only break the element down when at least one of its markers names a
    // product — otherwise the extra line would just repeat the element.
    const hasProduct = [...entry.byProduct.keys()].some(Boolean);
    const products = hasProduct
      ? [...entry.byProduct.entries()].map(([productId, qty]) => {
          const product = productById(productId);
          return {
            key: `el-${elementId}-${productId || 'none'}`,
            label: product ? `${product.item_code} ${catalogItemLabel(product)}` : t('summary.noProduct'),
            count: qty,
          };
        })
      : [];
    counts.push({ key: `el-${elementId}`, label: el.name, count: entry.total, products });
  }
  for (const [key, qty] of legacyQtyByKey) {
    const eqType = getEquipmentType(key);
    if (eqType) counts.push({ key: `legacy-${key}`, label: tEquipmentTypes(eqType.key), count: qty });
  }
  for (const ic of customIconsState) {
    const n = visibleMarkers.filter(m => m.custom_icon_id === ic.id).length;
    if (n > 0) counts.push({ key: ic.id, label: ic.name, count: n });
  }
  const totalEquipment = visibleMarkers.length;
  const totalCables = visibleCables.length;

  // Accessories are materials, not devices: they get their own block in the
  // summary and never count toward "Total equipment". Each accessory's
  // quantity is per unit of its marker, hence the multiplication.
  const accessoryTally = new Map();
  for (const m of visibleMarkers) {
    const markerQty = m.quantity ?? 1;
    for (const a of markerAccessories(m.id)) {
      const key = a.catalog_item_id || a.name.toLowerCase();
      if (!accessoryTally.has(key)) accessoryTally.set(key, { key, label: a.name, count: 0 });
      accessoryTally.get(key).count += (a.quantity ?? 1) * markerQty;
    }
  }
  const accessoryCounts = [...accessoryTally.values()];

  // Cable per type: what the equipment estimates plus what was traced on the
  // plan (only measurable with a scale), and the boxes to order for the sum —
  // rounded up, because 2.8 boxes of Cat6 is three boxes.
  const cableTotals = new Map();
  const cableEntry = ct => {
    if (!cableTotals.has(ct.id)) {
      cableTotals.set(ct.id, { key: ct.id, name: ct.name, color: ct.color, feetPerBox: ct.feet_per_box || 1000, estimated: 0, traced: 0 });
    }
    return cableTotals.get(ct.id);
  };
  for (const m of visibleMarkers) {
    const ct = cableTypeById(m.cable_type_id);
    if (!ct || !m.cable_feet) continue;
    cableEntry(ct).estimated += m.cable_feet * (m.quantity ?? 1);
  }
  if (feetPerPixel) {
    for (const c of visibleCables) {
      const ct = cableTypeById(c.cable_type_id);
      if (!ct) continue;
      cableEntry(ct).traced += cableLengthFeet(c) || 0;
    }
  }
  const cableFootage = [...cableTotals.values()].map(entry => {
    const total = entry.estimated + entry.traced;
    const boxes = Math.ceil(total / entry.feetPerBox);
    return { ...entry, total, boxes, leftover: boxes * entry.feetPerBox - total };
  });

  const cableColor = cable => cableTypesState.find(ct => ct.id === cable.cable_type_id)?.color || '#2a4cb5';
  const cableWidth = cable => cableTypesState.find(ct => ct.id === cable.cable_type_id)?.line_width || 1;
  const cableDashArray = cable => {
    const style = cableTypesState.find(ct => ct.id === cable.cable_type_id)?.dash_style;
    if (style === 'dashed') return `${W * 0.006},${W * 0.004}`;
    if (style === 'dotted') return `${W * 0.0015},${W * 0.003}`;
    return undefined;
  };
  const cableCounts = [];
  for (const ct of cableTypesState) {
    const n = visibleCables.filter(c => c.cable_type_id === ct.id).length;
    if (n > 0) cableCounts.push({ key: ct.id, label: ct.name, color: ct.color, count: n });
  }
  const untypedCableCount = visibleCables.filter(c => !c.cable_type_id).length;

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
          <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{[linkDisplay.clientName, linkDisplay.jobTitle].filter(Boolean).join(' — ') || t('header.unassigned')}</span>
            <button type="button" onClick={startEditingLink} style={{ background: 'none', border: 'none', color: 'var(--amber)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>✏️ {t('header.editLink')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">{t('header.viewOriginal')}</a>}
          <button className="btn btn-ghost" onClick={() => exportEquipmentListCSV(markers, elementTypes, customIconsState, cables, feetPerPixel, cableLengthFeet, plan.name, tEquipmentCsv, tEquipmentTypes, accessories, catalogProducts, cableTypesState)}>⬇️ {t('header.exportList')}</button>
          {canDeletePlan && <button className="btn btn-ghost" disabled={deleting} onClick={handleDeletePlan} style={{ color: 'var(--warn)' }}>{t('header.deletePlan')}</button>}
          <Link href={currentRole === 'tecnico' ? '/crew' : '/planos'} className="btn btn-ghost">← {t('header.back')}</Link>
        </div>
      </div>

      {editingLink && (
        <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 14 }}>
          <div style={{ minWidth: 260 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('linkForm.clientLabel')}</label>
            <ClientCombobox clients={allClients} value={linkClientId} onChange={id => { setLinkClientId(id); setLinkJobId(''); }} />
          </div>
          {linkJobs.length > 0 && (
            <div style={{ minWidth: 220 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{t('linkForm.jobLabel')}</label>
              <select value={linkJobId} onChange={e => setLinkJobId(e.target.value)} style={{ width: '100%' }}>
                <option value="">{t('linkForm.noJob')}</option>
                {linkJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary" disabled={savingLink} onClick={saveLink}>{savingLink ? t('linkForm.saving') : t('linkForm.save')}</button>
          <button className="btn btn-ghost" onClick={() => setEditingLink(false)}>{t('linkForm.cancel')}</button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ position: 'relative' }}>
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
        <button
          onClick={() => { setMode('select'); setCableDraft(null); }}
          className="btn btn-ghost"
          style={{ fontWeight: 700, background: mode === 'select' ? 'var(--navy)' : undefined, color: mode === 'select' ? '#fff' : undefined }}
        >
          🖱️ {t('toolbar.select')}
        </button>
        <button
          onClick={() => setShowAddElementPanel(s => !s)}
          className="btn btn-ghost"
          style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, background: showAddElementPanel ? 'var(--info-tint)' : undefined, border: showAddElementPanel ? '1.5px solid var(--navy)' : undefined }}
        >
          ➕ {t('toolbar.addElement')}
        </button>
        {mode !== 'select' && mode.type === 'place' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--info-tint)', border: '1.5px solid var(--navy)', borderRadius: 6, padding: '4px 8px' }}>
            {t('toolbar.placing', { name: mode.customIconId
              ? customIconsState.find(ic => ic.id === mode.customIconId)?.name
              : elementTypes.find(et => et.id === mode.elementId)?.name })}
            {/* The product stays armed for the whole run, so placing a dozen
                identical jacks only costs one trip to the catalog. */}
            {mode.catalogItemId ? (
              <>
                <span style={{ fontWeight: 700 }}>· {productById(mode.catalogItemId)?.item_code || catalogItemLabel(productById(mode.catalogItemId))}</span>
                <button
                  type="button" title={t('toolbar.clearProduct')}
                  onClick={() => setMode(m => ({ ...m, catalogItemId: null }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--muted)' }}
                >✕</button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setPickingPlaceProduct(v => !v); loadProductSuggestions(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--navy)', fontWeight: 700, fontSize: 12 }}
              >
                + {t('toolbar.product')}
              </button>
            )}
            {mode.cableTypeId ? (
              <>
                <span style={{ fontWeight: 700 }}>· {cableTypeById(mode.cableTypeId)?.name}{mode.cableFeet ? ` ${t('unitFeet', { count: mode.cableFeet })}` : ''}</span>
                <button
                  type="button" title={t('toolbar.clearCable')}
                  onClick={() => { setMode(m => ({ ...m, cableTypeId: null, cableFeet: null })); setPickingPlaceCable(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--muted)' }}
                >✕</button>
              </>
            ) : cableTypesState.length > 0 && (
              <button
                type="button"
                onClick={() => setPickingPlaceCable(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--navy)', fontWeight: 700, fontSize: 12 }}
              >
                + {t('toolbar.cableEstimate')}
              </button>
            )}
            <button type="button" onClick={() => { setMode('select'); setPickingPlaceProduct(false); setPickingPlaceCable(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        )}
        <button
          onClick={() => { setMode({ type: 'cable' }); setCableDraft(null); }}
          className="btn btn-ghost"
          style={{ background: mode !== 'select' && mode.type === 'cable' ? 'var(--amber-tint)' : undefined, border: mode !== 'select' && mode.type === 'cable' ? '1.5px solid var(--amber)' : undefined }}
        >
          🔌 {t('toolbar.cable')}
        </button>
        <button
          onClick={() => setShowCableTypesPanel(s => !s)}
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: showCableTypesPanel ? 'var(--info-tint)' : undefined, border: showCableTypesPanel ? '1.5px solid var(--navy)' : undefined }}
        >
          {activeCableTypeId && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cableTypesState.find(ct => ct.id === activeCableTypeId)?.color, flexShrink: 0 }} />
          )}
          🎨 {t('toolbar.cableTypes')} {activeCableTypeId ? `· ${cableTypesState.find(ct => ct.id === activeCableTypeId)?.name || ''}` : ''}
        </button>
        <button className="btn btn-ghost" onClick={() => setShowIconUpload(s => !s)}>+ {t('toolbar.importIcon')}</button>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
        <button
          onClick={() => setShowLayersPanel(s => !s)}
          className="btn btn-ghost"
          style={{ fontWeight: 700, background: showLayersPanel ? 'var(--info-tint)' : undefined, border: showLayersPanel ? '1.5px solid var(--navy)' : undefined }}
        >
          🗂️ {t('toolbar.layers')} {activeLayerId ? `· ${layers.find(l => l.id === activeLayerId)?.name || ''}` : ''}
        </button>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
        <button
          onClick={() => { setMode({ type: 'scale' }); setScaleClickA(null); setScalePending(null); }}
          className="btn btn-ghost"
          style={{ background: mode !== 'select' && mode.type === 'scale' ? 'var(--ok-tint)' : undefined, border: mode !== 'select' && mode.type === 'scale' ? '1.5px solid var(--ok)' : undefined }}
        >
          📏 {t('toolbar.scale')} {feetPerPixel ? '✓' : ''}
        </button>
      </div>

      {(showAddElementPanel || showCableTypesPanel || showLayersPanel) && (
        <div
          onClick={() => { setShowAddElementPanel(false); setShowCableTypesPanel(false); setShowLayersPanel(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 19 }}
        />
      )}

      {showAddElementPanel && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 340, maxWidth: 'calc(100vw - 40px)', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', borderRadius: 'var(--radius)' }}>
          <AddElementPanel
            elementTypes={elementTypes}
            customIcons={customIconsState}
            onSelectElement={elementId => {
              const element = elementTypes.find(et => et.id === elementId);
              if (element?.is_path_tool) {
                armPathTool(element);
              } else {
                setMode({ type: 'place', elementId, customIconId: null });
              }
              setShowAddElementPanel(false);
            }}
            onSelectCustomIcon={customIconId => { setMode({ type: 'place', elementId: null, customIconId }); setShowAddElementPanel(false); }}
          />
        </div>
      )}

      {showCableTypesPanel && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 340, maxWidth: 'calc(100vw - 40px)', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            {t('cableTypesPanel.hint')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              className="hover-row"
              onClick={() => setActiveCableTypeId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: activeCableTypeId === null ? 'var(--info-tint)' : undefined,
                border: activeCableTypeId === null ? '1.5px solid var(--navy)' : '1.5px solid transparent',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2a4cb5', flexShrink: 0 }} />
              <span style={{ fontSize: 13, flex: 1, fontStyle: 'italic', color: 'var(--muted)' }}>{t('cableTypesPanel.noType')}</span>
            </div>
            {cableTypesState.map(ct => (
              <div
                key={ct.id}
                className="hover-row"
                onClick={() => setActiveCableTypeId(ct.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  background: activeCableTypeId === ct.id ? 'var(--info-tint)' : undefined,
                  border: activeCableTypeId === ct.id ? '1.5px solid var(--navy)' : '1.5px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color" value={ct.color}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateCableTypeColor(ct.id, e.target.value)}
                    style={{ width: 22, height: 22, padding: 0, border: 'none', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <input
                    value={ct.name}
                    onFocus={() => { cableTypeNameOriginRef.current = ct.name; }}
                    onChange={e => updateCableTypeName(ct.id, e.target.value)}
                    onBlur={e => commitCableTypeName(ct.id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1, fontSize: 13, border: 'none', background: 'transparent', padding: '2px 4px' }}
                  />
                  <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12, color: 'var(--warn)' }}
                    onClick={e => { e.stopPropagation(); deleteCableType(ct.id); }}>🗑</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{t('cableTypesPanel.thickness')}</span>
                  <input
                    type="range" min="0.5" max="4" step="0.25"
                    value={ct.line_width ?? 1}
                    onChange={e => updateCableTypeWidth(ct.id, parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{(ct.line_width ?? 1).toFixed(2)}x</span>
                  <select
                    value={ct.dash_style || 'solid'}
                    onChange={e => updateCableTypeDash(ct.id, e.target.value)}
                    style={{ fontSize: 11, flexShrink: 0 }}
                  >
                    <option value="solid">{t('cableTypesPanel.dashSolid')}</option>
                    <option value="dashed">{t('cableTypesPanel.dashDashed')}</option>
                    <option value="dotted">{t('cableTypesPanel.dashDotted')}</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{t('cableTypesPanel.feetPerBox')}</span>
                  <input
                    type="number" min="1" step="1" inputMode="numeric"
                    value={ct.feet_per_box ?? 1000}
                    onChange={e => updateCableTypeFeetPerBox(ct.id, parseInt(e.target.value, 10))}
                    style={{ width: 90, fontSize: 11, padding: '2px 6px' }}
                  />
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={createCableType} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color" value={newCableTypeColor}
                onChange={e => setNewCableTypeColor(e.target.value)}
                style={{ width: 30, height: 30, padding: 0, border: 'none', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }}
              />
              <input
                value={newCableTypeName} onChange={e => setNewCableTypeName(e.target.value)}
                placeholder={t('cableTypesPanel.newTypeNamePlaceholder')}
                style={{ flex: 1, fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{t('cableTypesPanel.thickness')}</span>
              <input
                type="range" min="0.5" max="4" step="0.25"
                value={newCableTypeWidth}
                onChange={e => setNewCableTypeWidth(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{newCableTypeWidth.toFixed(2)}x</span>
              <select value={newCableTypeDash} onChange={e => setNewCableTypeDash(e.target.value)} style={{ fontSize: 11, flexShrink: 0 }}>
                <option value="solid">{t('cableTypesPanel.dashSolid')}</option>
                <option value="dashed">{t('cableTypesPanel.dashDashed')}</option>
                <option value="dotted">{t('cableTypesPanel.dashDotted')}</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingCableType || !newCableTypeName.trim()}>
              {savingCableType ? t('cableTypesPanel.creating') : t('cableTypesPanel.newType')}
            </button>
          </form>
        </div>
      )}

      {showLayersPanel && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 340, maxWidth: 'calc(100vw - 40px)', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            {t('layersPanel.hint')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              className="hover-row"
              onClick={() => setActiveLayerId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: activeLayerId === null ? 'var(--info-tint)' : undefined,
                border: activeLayerId === null ? '1.5px solid var(--navy)' : '1.5px solid transparent',
              }}
            >
              <button type="button" onClick={e => { e.stopPropagation(); toggleLayerVisibility(NO_LAYER); }}
                className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }}>
                {isLayerVisible(null) ? '👁️' : '🚫'}
              </button>
              <span style={{ fontSize: 13, flex: 1, fontStyle: 'italic', color: 'var(--muted)' }}>{t('layersPanel.noLayer')}</span>
            </div>
            {layers.map((l, i) => (
              <div
                key={l.id}
                className="hover-row"
                onClick={() => setActiveLayerId(l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  background: activeLayerId === l.id ? 'var(--info-tint)' : undefined,
                  border: activeLayerId === l.id ? '1.5px solid var(--navy)' : '1.5px solid transparent',
                }}
              >
                <button type="button" onClick={e => { e.stopPropagation(); toggleLayerVisibility(l.id); }}
                  className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }}>
                  {isLayerVisible(l.id) ? '👁️' : '🚫'}
                </button>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                <input
                  value={l.name}
                  onFocus={() => { layerNameOriginRef.current = l.name; }}
                  onChange={e => updateLayerName(l.id, e.target.value)}
                  onBlur={e => commitLayerName(l.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 13, border: 'none', background: 'transparent', padding: '2px 4px' }}
                />
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
                  disabled={i === 0} onClick={e => { e.stopPropagation(); moveLayer(l.id, -1); }}>↑</button>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
                  disabled={i === layers.length - 1} onClick={e => { e.stopPropagation(); moveLayer(l.id, 1); }}>↓</button>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12, color: 'var(--warn)' }}
                  onClick={e => { e.stopPropagation(); deleteLayer(l.id); }}>🗑</button>
              </div>
            ))}
          </div>
          <form onSubmit={createLayer} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={newLayerName} onChange={e => setNewLayerName(e.target.value)}
              placeholder={t('layersPanel.namePlaceholder')}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button type="submit" className="btn btn-primary" disabled={savingLayer || !newLayerName.trim()}>
              {savingLayer ? t('layersPanel.creating') : t('layersPanel.newLayer')}
            </button>
          </form>
        </div>
      )}
      </div>

      {mode !== 'select' && mode.type === 'place' && pickingPlaceProduct && !mode.catalogItemId && (
        <div className="card" style={{ padding: 10, maxWidth: 360 }}>
          <CatalogItemPicker
            products={catalogProducts}
            suggestions={productSuggestionsFor(mode.elementId)}
            onPick={item => { setMode(m => ({ ...m, catalogItemId: item.id })); setPickingPlaceProduct(false); }}
            onCancel={() => setPickingPlaceProduct(false)}
          />
        </div>
      )}

      {/* Stays open after the type is picked: the footage is typed right after,
          and unmounting the bar on the first choice left no way to enter it. */}
      {mode !== 'select' && mode.type === 'place' && pickingPlaceCable && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('toolbar.cableEstimate')}</span>
          <select
            value={mode.cableTypeId || ''}
            onChange={e => setMode(m => ({ ...m, cableTypeId: e.target.value || null }))}
            style={{ fontSize: 12, padding: '4px 6px', width: 'auto' }}
          >
            <option value="">{t('markerPanel.noCableType')}</option>
            {cableTypesState.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
          </select>
          <input
            type="number" min="0" step="1" inputMode="decimal"
            value={mode.cableFeet ?? ''}
            onChange={e => setMode(m => ({ ...m, cableFeet: e.target.value ? parseFloat(e.target.value) : null }))}
            placeholder={t('markerPanel.feetPlaceholder')}
            style={{ width: 90, fontSize: 12, padding: '4px 6px' }}
          />
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setPickingPlaceCable(false)}>
            {t('toolbar.doneCable')}
          </button>
        </div>
      )}

      {mode !== 'select' && mode.type === 'cable' && (
        <div className="card" style={{ padding: '8px 14px', fontSize: 13, background: 'var(--amber-tint)' }}>
          {!cableDraft
            ? t('cableHint.start')
            : t('cableHint.continue')}
        </div>
      )}

      {mode !== 'select' && mode.type === 'scale' && !scalePending && (
        <div className="card" style={{ padding: '8px 14px', fontSize: 13, background: 'var(--ok-tint)' }}>
          {!scaleClickA
            ? t('scaleHint.first')
            : t('scaleHint.second')}
        </div>
      )}

      {scalePending && (
        <form onSubmit={saveScale} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12, background: 'var(--ok-tint)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('scaleForm.question')}</span>
          <input
            autoFocus type="number" step="0.1" min="0.1" value={scaleFeetInput}
            onChange={e => setScaleFeetInput(e.target.value)}
            placeholder={t('scaleForm.placeholder')}
            style={{ width: 160 }}
          />
          <button type="submit" className="btn btn-primary" disabled={savingScale || !scaleFeetInput}>
            {savingScale ? t('scaleForm.saving') : t('scaleForm.save')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setScalePending(null); setScaleFeetInput(''); }}>{t('scaleForm.cancel')}</button>
        </form>
      )}

      {showIconUpload && (
        <form onSubmit={handleIconUpload} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12 }}>
          <input value={iconName} onChange={e => setIconName(e.target.value)} placeholder={t('iconUpload.namePlaceholder')} style={{ flex: 1, minWidth: 220 }} />
          <input type="file" accept="image/*" onChange={e => setIconFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn btn-primary" disabled={uploadingIcon || !iconName.trim() || !iconFile}>
            {uploadingIcon ? t('iconUpload.uploading') : t('iconUpload.upload')}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Canvas */}
        <div
          ref={wrapRef}
          onClick={handleCanvasClick}
          onPointerDown={handleWrapPointerDown}
          onPointerMove={handleWrapPointerMove}
          onPointerUp={handleWrapPointerUp}
          onPointerCancel={handleWrapPointerUp}
          onWheel={handleWheel}
          onDragStart={e => e.preventDefault()}
          style={{
            position: 'relative', flex: '1 1 600px', minWidth: 320,
            aspectRatio: `${W} / ${H}`, background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden',
            touchAction: 'none',
            cursor: panRef.current.dragging ? 'grabbing' : view.zoom > MIN_ZOOM && mode === 'select' ? 'grab' : mode !== 'select' ? 'crosshair' : 'default',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})` }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
            {imageUrlState && <image href={imageUrlState} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid meet" />}

            {visibleCables.map(c => {
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
                    stroke={selectedCableId === c.id ? 'var(--amber)' : cableColor(c)}
                    strokeWidth={(selectedCableId === c.id ? W * 0.004 : W * 0.0025) * cableWidth(c)}
                    strokeDasharray={selectedCableId === c.id ? undefined : cableDashArray(c)}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Wider invisible line on top — makes thin/zoomed-out cables much easier to click than the visible stroke alone. */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={W * 0.012}
                    style={{ cursor: mode === 'select' ? 'pointer' : 'default' }}
                    onClick={e => { if (mode === 'select') { e.stopPropagation(); setSelectedCableId(c.id); setSelectedMarkerId(null); } }}
                  />
                  {c.label && (
                    <text x={midX} y={midY} textAnchor="middle" dy={feet != null ? -iconSize * 0.55 : -iconSize * 0.15}
                      style={{ fontSize: iconSize * 0.4, fontWeight: 700, fill: cableColor(c), paintOrder: 'stroke', stroke: '#fff', strokeWidth: iconSize * 0.08 }}>
                      {c.label}
                    </text>
                  )}
                  {feet != null && (
                    <text x={midX} y={midY} textAnchor="middle" dy={-iconSize * 0.15}
                      style={{ fontSize: iconSize * 0.35, fontWeight: 600, fill: cableColor(c), paintOrder: 'stroke', stroke: '#fff', strokeWidth: iconSize * 0.07 }}>
                      {t('unitFeet', { count: feet.toFixed(1) })}
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

            {visibleMarkers.map(m => {
              if (!supportsAOC(m, elementTypes)) return null;
              const aoc = getAOC(m, elementTypes);
              if (!aoc.visible) return null;
              return (
                <AOCCone
                  key={`aoc-${m.id}`}
                  cx={m.pos_x * W}
                  cy={m.pos_y * H}
                  aoc={aoc}
                  onChange={updates => handleAOCChange(m.id, updates)}
                  svgScale={1 / view.zoom}
                  selected={selectedMarkerId === m.id}
                />
              );
            })}

            {visibleMarkers.map(m => {
              const cx = m.pos_x * W, cy = m.pos_y * H;
              const size = iconSize * (m.icon_scale ?? 1);
              const customIcon = m.custom_icon_id ? customIconsState.find(ic => ic.id === m.custom_icon_id) : null;
              const element = getMarkerElement(m, elementTypes);
              const resolvedIcon = element ? getElementIcon(element) : null;
              const isSelected = selectedMarkerId === m.id;
              return (
                <g
                  key={m.id}
                  transform={`translate(${cx}, ${cy})`}
                  onClick={e => handleMarkerClick(e, m)}
                  onPointerDown={e => handleMarkerPointerDown(e, m)}
                  style={{ cursor: mode === 'select' ? 'grab' : 'pointer' }}
                >
                  <circle r={size * 0.75} fill="#fff"
                    stroke={isSelected ? 'var(--amber)' : m.custom_color || '#c7cbd4'}
                    strokeWidth={isSelected || m.custom_color ? size * 0.08 : size * 0.04} />
                  {customIcon?.url ? (
                    <image href={customIcon.url} x={-size / 2} y={-size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
                  ) : resolvedIcon ? (
                    <svg x={-size / 2} y={-size / 2} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={resolvedIcon.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {resolvedIcon.icon}
                    </svg>
                  ) : (
                    <svg x={-size / 2} y={-size / 2} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={getEquipmentType(m.equipment_type)?.color || '#16223d'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {getEquipmentType(m.equipment_type)?.icon}
                    </svg>
                  )}
                </g>
              );
            })}
          </svg>
          </div>

          <div
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 10, top: 10, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 4,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4,
              boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
            }}
          >
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontWeight: 700 }} disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomByButton(ZOOM_STEP)}>+</button>
            <div style={{ fontSize: 11, textAlign: 'center', fontWeight: 700, color: 'var(--muted)' }}>{Math.round(view.zoom * 100)}%</div>
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontWeight: 700 }} disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomByButton(1 / ZOOM_STEP)}>−</button>
            {view.zoom > MIN_ZOOM && (
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 6px', fontSize: 10 }} onClick={resetZoom}>{t('zoomFit')}</button>
            )}
          </div>

          {selectedMarker && (() => {
            // The whole marker panel — quick-action header plus every
            // editable field — lives fixed at the top-left of the canvas
            // (same spot regardless of zoom/pan), like System Surveyor's
            // element toolbar. It does NOT track the marker's position on
            // the plan; that tracking behavior was confusing (position
            // changed depending on where the marker sat, could overlap it,
            // and moved every time you scrolled/zoomed). A fixed spot is
            // predictable: it's always in the same place when you have a
            // marker selected. Width/height still adapt to the canvas size
            // so it never overflows on a narrow or short viewport.
            const panelWidth = Math.min(260, Math.max(200, rectSize.width - 20));
            const panelMaxHeight = Math.max(200, rectSize.height - 20);
            return (
            <div
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onWheel={e => e.stopPropagation()}
              style={{
                position: 'absolute', left: 10, top: 10, zIndex: 6,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                width: panelWidth, maxHeight: panelMaxHeight, overflowY: 'auto',
              }}
            >
              <div style={{
                position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '6px 8px',
              }}>
                {getMarkerElement(selectedMarker, elementTypes) && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: getMarkerElement(selectedMarker, elementTypes).system_color, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                    {getMarkerElement(selectedMarker, elementTypes).system_abbr}
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedMarker.label
                    || customIconsState.find(ic => ic.id === selectedMarker.custom_icon_id)?.name
                    || getMarkerElement(selectedMarker, elementTypes)?.name
                    || (getEquipmentType(selectedMarker.equipment_type) && tEquipmentTypes(getEquipmentType(selectedMarker.equipment_type).key))}
                </span>

                {selectedMarkerAOC && (
                  <>
                    <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
                    <button
                      type="button" title={selectedMarkerAOC.visible ? t('markerPanel.hideAOC') : t('markerPanel.showAOC')}
                      onClick={() => handleAOCChange(selectedMarker.id, { visible: !selectedMarkerAOC.visible })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                    >
                      {selectedMarkerAOC.visible ? '📐' : '🚫'}
                    </button>
                    {selectedMarkerAOC.visible && (
                      <>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                          {Math.round(selectedMarkerAOC.direction)}°
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                          {feetPerPixel ? t('markerPanel.radiusFeet', { count: (selectedMarkerAOC.radius * feetPerPixel).toFixed(1) }) : t('markerPanel.radiusUnits', { count: Math.round(selectedMarkerAOC.radius) })}
                        </span>
                      </>
                    )}
                  </>
                )}

                <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
                <button
                  type="button" title={t('markerPanel.duplicate')} onClick={() => duplicateMarker(selectedMarker.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                >
                  📋
                </button>
                <button
                  type="button" title={t('markerPanel.delete')} onClick={() => deleteMarker(selectedMarker.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                >
                  🗑
                </button>
                <button
                  type="button" title={t('markerPanel.close')} onClick={() => setSelectedMarkerId(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontWeight: 700, padding: '0 2px', flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: 10 }}>
              <input
                value={selectedMarker.label || ''}
                onFocus={() => { labelOriginRef.current = selectedMarker.label || ''; }}
                onChange={e => updateMarkerLabel(selectedMarker.id, e.target.value)}
                onBlur={e => commitMarkerLabel(selectedMarker.id, e.target.value)}
                placeholder={t('markerPanel.labelPlaceholder')}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              />
              {(() => {
                const product = productById(selectedMarker.catalog_item_id);
                if (product) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, background: 'var(--info-tint)', borderRadius: 6, padding: '6px 8px' }}>
                      <span style={{ fontWeight: 700 }}>{product.item_code}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catalogItemLabel(product)}</span>
                      <button
                        type="button" title={t('markerPanel.clearProduct')}
                        onClick={() => setMarkerProduct(selectedMarker.id, null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, padding: 0 }}
                      >✕</button>
                    </div>
                  );
                }
                if (pickingMarkerProduct) {
                  return (
                    <div style={{ marginBottom: 8 }}>
                      <CatalogItemPicker
                        products={catalogProducts}
                        suggestions={productSuggestionsFor(selectedMarker.element_id)}
                        onPick={item => setMarkerProduct(selectedMarker.id, item)}
                        onCancel={() => setPickingMarkerProduct(false)}
                      />
                    </div>
                  );
                }
                return (
                  <button
                    className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', display: 'block', width: '100%', textAlign: 'center', marginBottom: 8 }}
                    onClick={() => { setPickingMarkerProduct(true); loadProductSuggestions(); }}
                  >
                    + {t('markerPanel.addProduct')}
                  </button>
                );
              })()}
              <input
                value={selectedMarker.model || ''}
                onFocus={() => { modelOriginRef.current = selectedMarker.model || ''; }}
                onChange={e => updateMarkerModel(selectedMarker.id, e.target.value)}
                onBlur={e => commitMarkerModel(selectedMarker.id, e.target.value)}
                placeholder={t('markerPanel.modelPlaceholder')}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              />
              <input
                value={selectedMarker.serial_number || ''}
                onFocus={() => { serialOriginRef.current = selectedMarker.serial_number || ''; }}
                onChange={e => updateMarkerSerial(selectedMarker.id, e.target.value)}
                onBlur={e => commitMarkerSerial(selectedMarker.id, e.target.value)}
                placeholder={t('markerPanel.serialPlaceholder')}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              />
              <select
                value={selectedMarker.layer_id || ''}
                onChange={e => updateMarkerLayer(selectedMarker.id, e.target.value || null)}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              >
                <option value="">{t('markerPanel.noLayer')}</option>
                {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('markerPanel.iconSize')}</span>
                <button className="btn btn-ghost" style={{ fontSize: 14, fontWeight: 700, padding: '2px 10px', marginLeft: 'auto' }}
                  disabled={(selectedMarker.icon_scale ?? 1) <= 0.25}
                  onClick={() => adjustMarkerScale(selectedMarker.id, -0.25)}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 34, textAlign: 'center' }}>
                  {Math.round((selectedMarker.icon_scale ?? 1) * 100)}%
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 14, fontWeight: 700, padding: '2px 10px' }}
                  disabled={(selectedMarker.icon_scale ?? 1) >= 2}
                  onClick={() => adjustMarkerScale(selectedMarker.id, 0.25)}>+</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('markerPanel.color')}</span>
                <input
                  type="color" value={selectedMarker.custom_color || getMarkerColor(selectedMarker, elementTypes)}
                  onChange={e => updateMarkerColor(selectedMarker.id, e.target.value)}
                  style={{ width: 26, height: 26, padding: 0, border: 'none', borderRadius: 4, marginLeft: 'auto', cursor: 'pointer' }}
                />
                {selectedMarker.custom_color && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => updateMarkerColor(selectedMarker.id, null)}>{t('markerPanel.reset')}</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('markerPanel.quantity')}</span>
                <button className="btn btn-ghost" style={{ fontSize: 14, fontWeight: 700, padding: '2px 10px', marginLeft: 'auto' }}
                  disabled={(selectedMarker.quantity ?? 1) <= 1}
                  onClick={() => adjustMarkerQuantity(selectedMarker.id, -1)}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {selectedMarker.quantity ?? 1}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 14, fontWeight: 700, padding: '2px 10px' }}
                  onClick={() => adjustMarkerQuantity(selectedMarker.id, 1)}>+</button>
              </div>
              {(() => {
                const markerQty = selectedMarker.quantity ?? 1;
                const rows = markerAccessories(selectedMarker.id);
                const query = accessorySearch.trim().toLowerCase();
                // Some catalog_items still have a null name (see
                // migrations/2026-08-17-catalog-item-name-backfill.sql), so both the
                // search and the label fall back to the item code.
                const catalogLabel = ci => ci.name || ci.item_code || '';
                const catalogMatches = query
                  ? (accessoryOptions?.catalog ?? []).filter(ci =>
                      catalogLabel(ci).toLowerCase().includes(query) || (ci.item_code || '').toLowerCase().includes(query)
                    ).slice(0, 6)
                  : [];
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('markerPanel.accessories')}</span>
                      <button
                        className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                        onClick={() => (addingAccessory ? setAddingAccessory(false) : openAccessoryForm())}
                      >
                        {addingAccessory ? t('markerPanel.cancelAccessory') : `+ ${t('markerPanel.addAccessory')}`}
                      </button>
                    </div>
                    {rows.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 4 }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</span>
                        <button className="btn btn-ghost" style={{ fontSize: 13, fontWeight: 700, padding: '0 7px' }}
                          disabled={(a.quantity ?? 1) <= 1}
                          onClick={() => adjustAccessoryQuantity(a.id, -1)}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{a.quantity ?? 1}</span>
                        <button className="btn btn-ghost" style={{ fontSize: 13, fontWeight: 700, padding: '0 7px' }}
                          onClick={() => adjustAccessoryQuantity(a.id, 1)}>+</button>
                        {markerQty > 1 && (
                          <span style={{ color: 'var(--muted)', fontSize: 11 }} title={t('markerPanel.accessoryTotalTitle')}>
                            ={(a.quantity ?? 1) * markerQty}
                          </span>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '0 6px', color: 'var(--warn)' }}
                          title={t('markerPanel.removeAccessory')}
                          onClick={() => deleteAccessory(a.id)}>🗑</button>
                      </div>
                    ))}
                    {addingAccessory && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 6, marginTop: 4 }}>
                        <input
                          autoFocus
                          value={accessorySearch}
                          onChange={e => setAccessorySearch(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addAccessory(selectedMarker.id, { name: accessorySearch }); }}
                          placeholder={t('markerPanel.accessorySearchPlaceholder')}
                          style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                        />
                        {!query && (accessoryOptions?.recent?.length ?? 0) > 0 && (
                          <>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', margin: '6px 0 2px' }}>{t('markerPanel.accessoryMostUsed')}</p>
                            {accessoryOptions.recent.map(r => (
                              <button
                                key={`${r.catalog_item_id || r.name}`} type="button" disabled={savingAccessory}
                                onClick={() => addAccessory(selectedMarker.id, { name: r.name, catalogItemId: r.catalog_item_id })}
                                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, padding: '4px 2px' }}
                              >
                                {r.name}
                              </button>
                            ))}
                          </>
                        )}
                        {query && catalogMatches.map(ci => (
                          <button
                            key={ci.id} type="button" disabled={savingAccessory}
                            onClick={() => addAccessory(selectedMarker.id, { name: catalogLabel(ci), catalogItemId: ci.id })}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, padding: '4px 2px' }}
                          >
                            <span style={{ color: 'var(--muted)' }}>{ci.item_code}</span> {ci.name || ''}
                          </button>
                        ))}
                        {query && (
                          <button
                            type="button" disabled={savingAccessory}
                            onClick={() => addAccessory(selectedMarker.id, { name: accessorySearch })}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '4px 2px' }}
                          >
                            {t('markerPanel.accessoryUseFreeText', { name: accessorySearch.trim() })}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const markerQty = selectedMarker.quantity ?? 1;
                const feet = selectedMarker.cable_feet;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{t('markerPanel.cable')}</span>
                    <select
                      value={selectedMarker.cable_type_id || ''}
                      onChange={e => updateMarkerCableType(selectedMarker.id, e.target.value)}
                      style={{ flex: 1, fontSize: 12, padding: '4px 6px', minWidth: 0 }}
                    >
                      <option value="">{t('markerPanel.noCableType')}</option>
                      {cableTypesState.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                    <input
                      type="number" min="0" step="1" inputMode="decimal"
                      value={feet ?? ''}
                      onFocus={() => { cableFeetOriginRef.current = feet ?? null; }}
                      onChange={e => updateMarkerCableFeet(selectedMarker.id, e.target.value)}
                      onBlur={e => commitMarkerCableFeet(selectedMarker.id, e.target.value)}
                      placeholder={t('markerPanel.feetPlaceholder')}
                      style={{ width: 62, fontSize: 12, padding: '4px 6px' }}
                    />
                    {markerQty > 1 && feet > 0 && (
                      <span style={{ color: 'var(--muted)', fontSize: 11 }} title={t('markerPanel.cableTotalTitle')}>
                        ={feet * markerQty}
                      </span>
                    )}
                  </div>
                );
              })()}
              {photoUrls[selectedMarker.id] ? (
                <div style={{ marginBottom: 8 }}>
                  <img
                    src={photoUrls[selectedMarker.id]}
                    alt=""
                    onClick={() => setLightboxUrl(photoUrls[selectedMarker.id])}
                    style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid var(--border)', display: 'block' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <label className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                      {t('markerPanel.changePhoto')}
                      <input type="file" accept="image/*" hidden onChange={e => handleMarkerPhotoUpload(selectedMarker.id, e.target.files?.[0])} />
                    </label>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--warn)' }} onClick={() => removeMarkerPhoto(selectedMarker.id)}>
                      {t('markerPanel.removePhoto')}
                    </button>
                  </div>
                </div>
              ) : (
                <label className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', display: 'block', textAlign: 'center', marginBottom: 8, cursor: 'pointer' }}>
                  {uploadingPhoto ? t('markerPanel.uploadingPhoto') : `📷 ${t('markerPanel.addPhoto')}`}
                  <input type="file" accept="image/*" hidden disabled={uploadingPhoto} onChange={e => handleMarkerPhotoUpload(selectedMarker.id, e.target.files?.[0])} />
                </label>
              )}
              <textarea
                value={selectedMarker.notes || ''}
                onFocus={() => { notesOriginRef.current = selectedMarker.notes || ''; }}
                onChange={e => updateMarkerNotes(selectedMarker.id, e.target.value)}
                onBlur={e => commitMarkerNotes(selectedMarker.id, e.target.value)}
                placeholder={t('markerPanel.notesPlaceholder')}
                rows={2}
                style={{ width: '100%', marginBottom: 8, fontSize: 13, resize: 'vertical' }}
              />
              <AOCPanel
                supported={supportsAOC(selectedMarker, elementTypes)}
                systemColor={getMarkerColor(selectedMarker, elementTypes)}
                aoc={getAOC(selectedMarker, elementTypes)}
                onChange={updates => handleAOCChange(selectedMarker.id, updates)}
              />
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', width: '100%', marginTop: 8 }}
                onClick={() => { setMode({ type: 'cable' }); setCableDraft({ fromMarkerId: selectedMarker.id, points: [] }); setSelectedMarkerId(null); }}>
                🔌 {t('markerPanel.cableButton')}
              </button>
              </div>
            </div>
            );
          })()}

          {selectedCable && (
            <div style={{ position: 'absolute', right: 10, bottom: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 5, width: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                {cableLengthFeet(selectedCable) != null ? t('unitFeet', { count: cableLengthFeet(selectedCable).toFixed(1) }) : t('cablePanel.noScale')}
              </div>
              <input
                value={selectedCable.label || ''}
                onFocus={() => { cableLabelOriginRef.current = selectedCable.label || ''; }}
                onChange={e => updateCableLabel(selectedCable.id, e.target.value)}
                onBlur={e => commitCableLabel(selectedCable.id, e.target.value)}
                placeholder={t('cablePanel.titlePlaceholder')}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              />
              <textarea
                value={selectedCable.description || ''}
                onFocus={() => { cableDescriptionOriginRef.current = selectedCable.description || ''; }}
                onChange={e => updateCableDescription(selectedCable.id, e.target.value)}
                onBlur={e => commitCableDescription(selectedCable.id, e.target.value)}
                placeholder={t('cablePanel.descriptionPlaceholder')}
                rows={2}
                style={{ width: '100%', marginBottom: 8, fontSize: 13, resize: 'vertical' }}
              />
              <select
                value={selectedCable.layer_id || ''}
                onChange={e => updateCableLayer(selectedCable.id, e.target.value || null)}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              >
                <option value="">{t('cablePanel.noLayer')}</option>
                {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select
                value={selectedCable.cable_type_id || ''}
                onChange={e => updateCableType(selectedCable.id, e.target.value || null)}
                style={{ width: '100%', marginBottom: 8, fontSize: 13 }}
              >
                <option value="">{t('cablePanel.noCableType')}</option>
                {cableTypesState.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: 'var(--warn)' }} onClick={() => deleteCable(selectedCable.id)}>
                {t('cablePanel.delete')}
              </button>
            </div>
          )}
        </div>

        {lightboxUrl && (
          <div
            onClick={() => setLightboxUrl(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, cursor: 'zoom-out' }}
          >
            <img src={lightboxUrl} alt="" style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
          </div>
        )}

        {/* Summary panel */}
        <div className="card" style={{ flex: '0 0 260px', minWidth: 220 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 12 }}>{t('summary.title')}</p>
          {counts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('summary.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {counts.map(c => (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{c.label}</span>
                    <span style={{ fontWeight: 700 }}>{c.count}</span>
                  </div>
                  {(c.products ?? []).map(p => (
                    <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12, color: 'var(--muted)', paddingLeft: 10 }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                      <span style={{ fontWeight: 700 }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800 }}>
            <span>{t('summary.totalEquipment')}</span>
            <span>{totalEquipment}</span>
          </div>
          {accessoryCounts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>{t('summary.accessories')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {accessoryCounts.map(a => (
                  <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ flex: 1 }}>{a.label}</span>
                    <span style={{ fontWeight: 700 }}>{a.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cableFootage.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>{t('summary.cabling')}</p>
              {cableFootage.map(c => (
                <div key={c.key} style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontWeight: 700 }}>{t('unitFeet', { count: Math.round(c.total).toLocaleString() })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 14 }}>
                    {t('summary.boxes', { count: c.boxes, size: c.feetPerBox.toLocaleString() })}
                    {c.leftover > 0 && ` · ${t('summary.leftover', { count: Math.round(c.leftover).toLocaleString() })}`}
                  </div>
                  {c.estimated > 0 && c.traced > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 14 }}>
                      {t('summary.cableSources', { estimated: Math.round(c.estimated).toLocaleString(), traced: Math.round(c.traced).toLocaleString() })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            <span>{t('summary.cablesTraced')}</span>
            <span>{totalCables}</span>
          </div>
          {cableCounts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {cableCounts.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
              {untypedCableCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2a4cb5', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{t('summary.noType')}</span>
                  <span style={{ fontWeight: 700 }}>{untypedCableCount}</span>
                </div>
              )}
            </div>
          )}
          {feetPerPixel && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--ok)' }}>
              <span>{t('summary.totalFootage')}</span>
              <span>{t('unitFeet', { count: visibleCables.reduce((sum, c) => sum + (cableLengthFeet(c) || 0), 0).toFixed(1) })}</span>
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '8px 0' }} />
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {feetPerPixel ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('summary.scaleDefined')}</span>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={clearScale}>{t('summary.deleteScale')}</button>
              </div>
            ) : (
              <span>{t('summary.scaleUndefined')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
