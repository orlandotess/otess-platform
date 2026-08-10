'use client';
import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import ClientCombobox from '../facturas/nueva/ClientCombobox';
import LineItemRow from '../LineItemRow';
import LineItemPicker from '../LineItemPicker';
import CableCalculator from '../CableCalculator';
import TaxBreakdown from '../TaxBreakdown';
import { calcularIVU, tasaParaLinea } from '../../lib/tax';

const DEFAULT_TERMS = `Garantía del Servicio: OTESS se compromete a brindar soporte técnico y mantenimiento correctivo sobre la instalación y configuración de los sistemas implementados por un período de un (1) año a partir de la fecha de finalización del proyecto.

Garantía de los Equipos: La garantía de los equipos y dispositivos instalados está sujeta a los términos y condiciones establecidos por el fabricante o suplidor. OTESS gestionará el proceso de garantía con el proveedor correspondiente en caso de defectos de fabricación dentro del período estipulado por el fabricante. No obstante, los tiempos de respuesta y el alcance de dicha garantía dependerán exclusivamente de la política del suplidor.`;

const TERMS_TEMPLATES = [
  { key: 'standard', label: 'Garantía estándar', text: DEFAULT_TERMS },
];

function emptyItem(overrides = {}) {
  return {
    key: Math.random().toString(36).slice(2),
    parentKey: null, combinePrice: true,
    type: 'labor', tax_category: 'labor', title: '', description: '', quantity: 1,
    unit_price: '', msrp: '', supplier_price: '', exempt: false, vendor: '', catalog_item_id: null, saveToCatalog: false, group_description: '',
    photoFile: null, photoPreview: null, existingPhotoPath: null,
    ...overrides,
  };
}
function emptyArea(name = 'Área 1') {
  return { key: Math.random().toString(36).slice(2), name, items: [emptyItem()] };
}
// Rebuilds the local {areas: [{name, items}]} builder shape from a flat list
// of line items (loaded from estimate_line_items or job_line_items), grouping
// by each item's `area` tag — same grouping ProposalDocument.js's area
// sections use, so edit mode reconstructs what will render. Accessories
// (parent_item_id children) are re-linked to their parent's freshly-minted
// local key right after it, same two-pass shape PropuestaForm.js uses.
function itemsToAreas(items) {
  const rows = items ?? [];
  const topLevel = rows.filter(li => !li.parent_item_id).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const areas = [];
  topLevel.forEach(li => {
    const name = li.area || 'General';
    let area = areas.find(a => a.name === name);
    if (!area) { area = { key: Math.random().toString(36).slice(2), name, items: [] }; areas.push(area); }
    const parent = emptyItem({
      type: li.type, tax_category: li.tax_category ?? li.type, title: li.title ?? '', description: li.description,
      quantity: li.quantity, unit_price: li.unit_price,
      msrp: li.msrp ?? '', supplier_price: li.supplier_price ?? '', exempt: !!li.exempt_reason,
      vendor: li.vendor ?? '', catalog_item_id: li.catalog_item_id ?? null,
      combinePrice: li.combine_price !== false, group_description: li.group_description ?? '',
      photoPreview: li.photo_signed_url ?? null, existingPhotoPath: li.photo_url ?? null,
    });
    area.items.push(parent);
    rows.filter(c => c.parent_item_id === li.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach(child => {
      area.items.push(emptyItem({
        parentKey: parent.key,
        type: child.type, tax_category: child.tax_category ?? child.type, description: child.description,
        quantity: child.quantity, unit_price: child.unit_price,
        msrp: child.msrp ?? '', supplier_price: child.supplier_price ?? '', exempt: !!child.exempt_reason,
        photoPreview: child.photo_signed_url ?? null, existingPhotoPath: child.photo_url ?? null,
      }));
    });
  });
  return areas.length ? areas : [emptyArea()];
}

export default function EstimateForm({ initialData = null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');
  const isEdit = !!initialData;

  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [properties, setProperties] = useState([]);
  const [propertyMode, setPropertyMode] = useState(initialData?.estimate?.property_id ? 'existing' : 'none'); // none | existing | new
  const [newProperty, setNewProperty] = useState({ name: '', street: '', city: '', state: 'PR', zip: '' });
  const [form, setForm] = useState(initialData ? {
    client_id: initialData.estimate.client_id ?? '', job_id: initialData.estimate.job_id ?? '',
    property_id: initialData.estimate.property_id ?? '', title: initialData.estimate.title ?? '',
    notes: initialData.estimate.notes ?? '', bill_to: initialData.estimate.bill_to ?? 'person',
    terms: initialData.estimate.terms ?? '',
    issued_at: initialData.estimate.issued_at ?? new Date().toISOString().split('T')[0],
    valid_until: initialData.estimate.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  } : {
    client_id: '', job_id: '', property_id: '', title: '', notes: '', bill_to: 'person', terms: '',
    issued_at: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });
  const [areas, setAreas] = useState(initialData?.items?.length ? itemsToAreas(initialData.items) : [emptyArea()]);
  const [areaMenuOpen, setAreaMenuOpen] = useState(null);
  const [dragItem, setDragItem] = useState(null); // { areaKey, itemKey } — item currently being dragged
  const [cableCalcTarget, setCableCalcTarget] = useState(null); // { areaKey } — which area the calculator adds into, or null when closed
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('jobs').select('id, title, client_id, bill_to, job_line_items(*)').order('created_at', { ascending: false }).then(({ data }) => setJobs(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    supabase.from('tax_rules').select('client_type, line_item_type, rate').then(({ data }) => setTaxRules(data ?? []));
  }, []);

  // Catalog is fetched once per mount with no realtime subscription, so an item added in
  // /catalogo in another tab wouldn't show up in the line-item picker until a hard reload.
  // Refetch whenever this tab/window comes back into focus to keep it current.
  useEffect(() => {
    function refreshCatalog() {
      if (document.visibilityState !== 'visible') return;
      supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    }
    document.addEventListener('visibilitychange', refreshCatalog);
    window.addEventListener('focus', refreshCatalog);
    return () => {
      document.removeEventListener('visibilitychange', refreshCatalog);
      window.removeEventListener('focus', refreshCatalog);
    };
  }, []);

  useEffect(() => {
    if (!form.client_id) { setProperties([]); return; }
    supabase.from('client_properties').select('*').eq('client_id', form.client_id).order('is_primary', { ascending: false })
      .then(({ data }) => setProperties(data ?? []));
  }, [form.client_id]);

  useEffect(() => {
    if (!isEdit && jobIdParam && jobs.length) {
      const job = jobs.find(j => j.id === jobIdParam);
      if (job) {
        setForm(f => ({ ...f, job_id: job.id, client_id: job.client_id, bill_to: job.bill_to ?? 'person', title: job.title ?? '' }));
        if (job.job_line_items?.length) {
          Promise.all(job.job_line_items.map(async li => {
            let photoPreview = null;
            if (li.photo_url) {
              const { data } = await supabase.storage.from('Job-photos').createSignedUrl(li.photo_url, 3600);
              photoPreview = data?.signedUrl ?? null;
            }
            return { ...li, photo_signed_url: photoPreview };
          })).then(loaded => setAreas(itemsToAreas(loaded)));
        }
      }
    }
  }, [jobIdParam, jobs]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedClient = clients.find(c => c.id === form.client_id);
  const clientType = selectedClient?.client_type ?? 'final';
  const hasCompany = !!selectedClient?.company;

  function addArea() {
    setAreas(prev => [...prev, emptyArea(`Área ${prev.length + 1}`)]);
  }
  function removeArea(areaKey) {
    setAreas(prev => prev.filter(a => a.key !== areaKey));
  }
  function updateAreaName(areaKey, name) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, name } : a));
  }
  function addItem(areaKey, overrides = {}) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: [...a.items, emptyItem(overrides)] } : a));
  }
  // Used by the cable/tubo calculator — merges a prefilled item into a specific
  // area instead of appending a blank one. The calculator's own `area` field is
  // dropped since grouping here already happens structurally, by area section.
  function addPrefilledItem(areaKey, { area, ...item }) {
    addItem(areaKey, { type: 'product', tax_category: 'product', ...item });
  }
  async function addFromCatalog(areaKey, catalogItem) {
    let existingPhotoPath = null, photoPreview = null;
    if (catalogItem.photo_url) {
      const { data } = await supabase.storage.from('Job-photos').createSignedUrl(catalogItem.photo_url, 3600);
      existingPhotoPath = catalogItem.photo_url;
      photoPreview = data?.signedUrl ?? null;
    }
    addItem(areaKey, {
      type: catalogItem.type, tax_category: catalogItem.tax_category,
      title: catalogItem.name || '', description: catalogItem.description,
      unit_price: catalogItem.price ?? '', msrp: catalogItem.msrp ?? '', supplier_price: catalogItem.supplier_price ?? '',
      vendor: catalogItem.vendor || '', catalog_item_id: catalogItem.id,
      photoPreview, existingPhotoPath,
    });
  }
  // Accessories are inserted right after the last item already belonging to
  // their parent's group, so they stay visually grouped under it.
  function addAccessory(areaKey, parentKey) {
    setAreas(prev => prev.map(a => {
      if (a.key !== areaKey) return a;
      let insertAt = a.items.findIndex(it => it.key === parentKey);
      const parentType = a.items[insertAt]?.type || 'product';
      for (let i = insertAt + 1; i < a.items.length; i++) {
        if (a.items[i].parentKey === parentKey) insertAt = i;
        else break;
      }
      const items = [...a.items];
      items.splice(insertAt + 1, 0, emptyItem({ parentKey, type: parentType, tax_category: parentType === 'fee' ? 'labor' : parentType }));
      return { ...a, items };
    }));
  }
  function removeItem(areaKey, itemKey) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: a.items.filter(it => it.key !== itemKey && it.parentKey !== itemKey) } : a));
  }
  function duplicateItem(areaKey, itemKey) {
    setAreas(prev => prev.map(a => {
      if (a.key !== areaKey) return a;
      const idx = a.items.findIndex(it => it.key === itemKey);
      if (idx === -1) return a;
      const clone = { ...a.items[idx], key: Math.random().toString(36).slice(2) };
      return { ...a, items: [...a.items.slice(0, idx + 1), clone, ...a.items.slice(idx + 1)] };
    }));
  }
  // Moves a top-level item + its trailing accessory block (contiguous in the
  // items array, linked by parentKey) from one area to another, or reorders
  // it within the same area. beforeItemKey is where to insert — null appends
  // at the end of the target area.
  function moveItem(fromAreaKey, itemKey, toAreaKey, beforeItemKey) {
    setAreas(prev => {
      const fromArea = prev.find(a => a.key === fromAreaKey);
      if (!fromArea) return prev;
      const startIdx = fromArea.items.findIndex(it => it.key === itemKey);
      if (startIdx === -1) return prev;
      let endIdx = startIdx;
      while (endIdx + 1 < fromArea.items.length && fromArea.items[endIdx + 1].parentKey === itemKey) endIdx++;
      const block = fromArea.items.slice(startIdx, endIdx + 1);
      const blockKeys = new Set(block.map(it => it.key));
      if (beforeItemKey && blockKeys.has(beforeItemKey)) return prev; // dropped onto itself/its own accessory

      const afterRemoval = prev.map(a => a.key === fromAreaKey ? { ...a, items: a.items.filter(it => !blockKeys.has(it.key)) } : a);
      return afterRemoval.map(a => {
        if (a.key !== toAreaKey) return a;
        const items = [...a.items];
        const insertIdx = beforeItemKey ? items.findIndex(it => it.key === beforeItemKey) : -1;
        items.splice(insertIdx === -1 ? items.length : insertIdx, 0, ...block);
        return { ...a, items };
      });
    });
  }
  function setItem(areaKey, itemKey, k, v) {
    setAreas(prev => prev.map(a => a.key === areaKey ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, [k]: v } : it) } : a));
  }
  function setItemType(areaKey, itemKey, type) {
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, type, tax_category: type === 'fee' ? (it.tax_category || 'labor') : type } : it) }
      : a));
  }
  function handleItemPhoto(areaKey, itemKey, file) {
    if (!file) return;
    setItem(areaKey, itemKey, 'photoFile', file);
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null } : it) }
      : a));
  }
  async function applyCatalogItemPhoto(areaKey, itemKey, match) {
    const current = areas.find(a => a.key === areaKey)?.items.find(it => it.key === itemKey);
    if (!current || current.photoFile || current.existingPhotoPath || !match.photo_url) return;
    const { data } = await supabase.storage.from('Job-photos').createSignedUrl(match.photo_url, 3600);
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey && !it.photoFile && !it.existingPhotoPath ? { ...it, existingPhotoPath: match.photo_url, photoPreview: data?.signedUrl ?? it.photoPreview } : it) }
      : a));
  }
  function handleCatalogSelect(areaKey, itemKey, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setAreas(prev => prev.map(a => a.key === areaKey
        ? { ...a, items: a.items.map(it => it.key === itemKey ? {
              ...it, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
              vendor: it.vendor || match.vendor || '', catalog_item_id: match.id, title: it.title || match.name || match.description, tax_category: match.tax_category ?? it.tax_category,
            } : it) }
        : a));
      applyCatalogItemPhoto(areaKey, itemKey, match);
    } else {
      setItem(areaKey, itemKey, 'description', value);
      setItem(areaKey, itemKey, 'catalog_item_id', null);
    }
  }
  function handleTitleCatalogSelect(areaKey, itemKey, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setAreas(prev => prev.map(a => a.key === areaKey
        ? { ...a, items: a.items.map(it => it.key === itemKey ? {
              ...it, title: match.name || match.description, description: it.description || `${match.item_code} — ${match.description}`,
              unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
              vendor: it.vendor || match.vendor || '', catalog_item_id: match.id, tax_category: match.tax_category ?? it.tax_category,
            } : it) }
        : a));
      applyCatalogItemPhoto(areaKey, itemKey, match);
    } else {
      setItem(areaKey, itemKey, 'title', value);
    }
  }

  const flatItems = areas.flatMap(a => a.items);
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];
  // Accessories only carry their own weight in the total when their parent
  // has opted out of "Combinar precio" — otherwise the parent's own price is
  // assumed to already include them.
  function itemLineTotal(it, area) {
    if (it.parentKey) {
      const parent = area?.items.find(p => p.key === it.parentKey);
      if (!parent || parent.combinePrice !== false) return 0;
    }
    return (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  }
  function areaTotal(area) {
    return area.items.reduce((s, it) => s + itemLineTotal(it, area), 0);
  }
  // calcularIVU/TaxBreakdown sum quantity*unit_price directly with no
  // parent/child awareness, so bundled accessories need their price zeroed
  // out here before they're fed in — same net effect as itemLineTotal above.
  const flatItemsForTax = areas.flatMap(a => a.items.map(it => it.parentKey && itemLineTotal(it, a) === 0 ? { ...it, unit_price: 0 } : it));
  const t = calcularIVU(flatItemsForTax, clientType, taxRules);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!flatItems.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    if (flatItems.some(i => !i.description.trim())) { setError('Todas las líneas necesitan una descripción antes de guardar.'); return; }
    if (propertyMode === 'new' && !newProperty.name.trim()) { setError('Ponle un nombre a la propiedad nueva'); return; }
    setSaving(true); setError('');

    let propertyId = null;
    if (propertyMode === 'existing' && form.property_id) {
      propertyId = form.property_id;
    } else if (propertyMode === 'new') {
      const { data: newProp, error: propErr } = await supabase.from('client_properties').insert([{
        client_id: form.client_id,
        name: newProperty.name.trim(),
        street: newProperty.street || null,
        city: newProperty.city || null,
        state: newProperty.state || null,
        zip: newProperty.zip || null,
        is_primary: properties.length === 0,
      }]).select().single();
      if (propErr) { setError(propErr.message); setSaving(false); return; }
      propertyId = newProp.id;
    }

    // estimates no tiene columna propia para "reembolso" — se pliega en
    // subtotal_products (tasa 0%, no afecta tax_products). Ver la misma nota
    // en app/facturas/InvoiceForm.js.
    const productCat = t.categorias.find(c => c.codigo === 'product');
    const laborCat = t.categorias.find(c => c.codigo === 'labor');
    const reembolsoCat = t.categorias.find(c => c.codigo === 'reembolso');
    const aggTotals = {
      subtotal_products: productCat.base + reembolsoCat.base,
      tax_products: productCat.impuesto + reembolsoCat.impuesto,
      subtotal_labor: laborCat.base,
      tax_labor: laborCat.impuesto,
      total: t.total,
    };

    let estimate;
    if (isEdit) {
      const { data: current } = await supabase.from('estimates').select('status').eq('id', initialData.estimate.id).single();
      if (!current || !['draft', 'sent'].includes(current.status)) {
        setError('Este estimado ya no se puede editar (fue aceptado, convertido o cancelado).');
        setSaving(false);
        return;
      }
      const { data: updated, error: err } = await supabase.from('estimates').update({
        client_id: form.client_id,
        job_id: form.job_id || null,
        property_id: propertyId,
        title: form.title || null,
        notes: form.notes || null,
        terms: form.terms || null,
        issued_at: form.issued_at,
        valid_until: form.valid_until,
        bill_to: form.bill_to,
        ...aggTotals,
      }).eq('id', initialData.estimate.id).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      estimate = updated;
      await supabase.from('estimate_line_items').delete().eq('estimate_id', estimate.id);
    } else {
      const { data: allEstimates } = await supabase.from('estimates').select('estimate_number');
      let maxNum = 1000;
      (allEstimates ?? []).forEach(est => {
        const match = est.estimate_number?.match(/^EST-(\d+)$/);
        if (match) {
          const n = parseInt(match[1]);
          if (n > maxNum) maxNum = n;
        }
      });
      const estimateNumber = `EST-${maxNum + 1}`;

      const { data: created, error: err } = await supabase.from('estimates').insert([{
        estimate_number: estimateNumber,
        client_id: form.client_id,
        job_id: form.job_id || null,
        property_id: propertyId,
        title: form.title || null,
        notes: form.notes || null,
        terms: form.terms || null,
        issued_at: form.issued_at,
        valid_until: form.valid_until,
        status: 'draft',
        bill_to: form.bill_to,
        ...aggTotals,
      }]).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      estimate = created;
    }

    async function uploadItemPhoto(i, sortOrder) {
      if (!i.photoFile) return i.existingPhotoPath ?? null;
      const ext = i.photoFile.name.split('.').pop();
      const path = `${estimate.id}/${Date.now()}-${sortOrder}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
      return upErr ? null : path;
    }

    // Ítems marcados "☑ Guardar en catálogo" que no vienen de una selección
    // del picker (catalog_item_id vacío) se crean en catalog_items aquí,
    // mismo criterio que /catalogo e InvoiceForm.js: código = título, nombre
    // en blanco. Si ya existe un ítem con ese código+tipo se reusa en vez de
    // duplicar. No bloquea el guardado del estimado si la creación falla.
    for (const area of areas) {
      for (const i of area.items) {
        if (!i.saveToCatalog || i.catalog_item_id || i.parentKey) continue;
        if (i.type !== 'labor' && i.type !== 'product') continue;
        const code = (i.title || '').trim();
        if (!code || !i.description.trim()) continue;
        const { data: existing } = await supabase.from('catalog_items').select('id').eq('type', i.type).ilike('item_code', code).maybeSingle();
        if (existing) { i.catalog_item_id = existing.id; continue; }
        const { data: createdCatalogItem, error: catErr } = await supabase.from('catalog_items').insert([{
          type: i.type, item_code: code, description: i.description.trim(),
          price: parseFloat(i.unit_price) || 0,
          msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
          supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
          vendor: i.vendor || null,
          tax_category: i.type,
        }]).select().single();
        if (!catErr && createdCatalogItem) {
          i.catalog_item_id = createdCatalogItem.id;
          setCatalogItems(prev => [...prev, createdCatalogItem]);
        }
      }
    }

    // Parents are inserted first so their DB ids can be attached to their
    // accessories' parent_item_id in a second pass.
    let sortOrder = 0;
    let liErr = null;
    const keyToId = {};
    for (const area of areas) {
      for (const i of area.items.filter(it => !it.parentKey && it.description.trim())) {
        const photoPath = await uploadItemPhoto(i, sortOrder);
        const base = itemLineTotal(i, area);
        const rate = tasaParaLinea(i, clientType, taxRules);
        const { data: row, error: err } = await supabase.from('estimate_line_items').insert([{
          estimate_id: estimate.id, type: i.type, tax_category: i.tax_category || i.type, title: i.title || null, description: i.description,
          quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
          msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
          supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
          exempt_reason: i.exempt ? 'Exento' : null,
          area: area.name || null, vendor: i.vendor || null, catalog_item_id: i.catalog_item_id || null,
          combine_price: i.combinePrice !== false, group_description: i.group_description?.trim() || null,
          photo_url: photoPath,
          tax_rate: rate, line_total: base, tax_amount: base * rate,
          sort_order: sortOrder++,
        }]).select().single();
        if (err) { liErr = err; break; }
        if (row) keyToId[i.key] = row.id;
      }
      if (liErr) break;
    }
    if (!liErr) {
      for (const area of areas) {
        for (const i of area.items.filter(it => it.parentKey && it.description.trim() && keyToId[it.parentKey])) {
          const photoPath = await uploadItemPhoto(i, sortOrder);
          const base = itemLineTotal(i, area);
          const rate = tasaParaLinea(i, clientType, taxRules);
          const { error: err } = await supabase.from('estimate_line_items').insert([{
            estimate_id: estimate.id, type: i.type, tax_category: i.tax_category || i.type, description: i.description,
            quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
            msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
            supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
            exempt_reason: i.exempt ? 'Exento' : null,
            area: area.name || null, parent_item_id: keyToId[i.parentKey],
            photo_url: photoPath,
            tax_rate: rate, line_total: base, tax_amount: base * rate,
            sort_order: sortOrder++,
          }]);
          if (err) { liErr = err; break; }
        }
        if (liErr) break;
      }
    }
    if (liErr) {
      setError(`El estimado ${estimate.estimate_number} se guardó pero no se pudieron guardar sus líneas: ${liErr.message}. Ábrelo y agrégalas manualmente.`);
      setSaving(false);
      return;
    }

    router.push(`/estimados/${estimate.id}`);
  }

  return (
    <div className="admin-shell ds-estimados">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">{isEdit ? `Editar estimado ${initialData.estimate.estimate_number}` : 'Nuevo estimado'}</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <ClientCombobox clients={clients} value={form.client_id} onChange={id => {
                    set('client_id', id); set('bill_to', 'person'); set('property_id', '');
                    setPropertyMode('none'); setNewProperty({ name: '', street: '', city: '', state: 'PR', zip: '' });
                  }} />
                </div>
                <div className="form-group">
                  <label>Trabajo (opcional)</label>
                  <select value={form.job_id} onChange={e => {
                    const jid = e.target.value;
                    const job = jobs.find(j => j.id === jid);
                    setForm(f => ({ ...f, job_id: jid, title: job?.title ?? '' }));
                  }}>
                    <option value="">— Sin trabajo asociado —</option>
                    {jobs.filter(j => !form.client_id || j.client_id === form.client_id).map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Título del estimado</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ej: Sistema de cámaras - Oficina Principal" />
              </div>

              {hasCompany && (
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label>A nombre de</label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="person" checked={form.bill_to === 'person'} onChange={() => set('bill_to', 'person')} />
                      {selectedClient?.name}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                      <input type="radio" name="bill_to" value="company" checked={form.bill_to === 'company'} onChange={() => set('bill_to', 'company')} />
                      {selectedClient?.company}
                    </label>
                  </div>
                </div>
              )}

              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Válida hasta</label>
                  <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Notas para el cliente</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas, condiciones de pago, etc..." />
              </div>
            </div>

            {form.client_id && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>📍 Propiedad (opcional)</p>
                <div className="form-group">
                  <label>Dirección del trabajo</label>
                  <select
                    value={propertyMode === 'existing' ? form.property_id : (propertyMode === 'new' ? '__new__' : '')}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '__new__') { setPropertyMode('new'); set('property_id', ''); }
                      else if (v === '') { setPropertyMode('none'); set('property_id', ''); }
                      else { setPropertyMode('existing'); set('property_id', v); }
                    }}>
                    <option value="">— Sin propiedad —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_primary ? ' ★' : ''}</option>)}
                    <option value="__new__">+ Dirección nueva</option>
                  </select>
                </div>
                {propertyMode === 'new' && (
                  <>
                    <div className="form-group">
                      <label>Nombre de la propiedad</label>
                      <input value={newProperty.name} onChange={e => setNewProperty(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Oficina Principal, Almacén Caguas" />
                    </div>
                    <div className="form-group">
                      <label>Dirección</label>
                      <input value={newProperty.street} onChange={e => setNewProperty(p => ({ ...p, street: e.target.value }))} placeholder="Calle y número" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                      <div className="form-group">
                        <label>Ciudad</label>
                        <input value={newProperty.city} onChange={e => setNewProperty(p => ({ ...p, city: e.target.value }))} placeholder="San Juan" />
                      </div>
                      <div className="form-group">
                        <label>Estado</label>
                        <input value={newProperty.state} onChange={e => setNewProperty(p => ({ ...p, state: e.target.value }))} placeholder="PR" />
                      </div>
                      <div className="form-group">
                        <label>Zip</label>
                        <input value={newProperty.zip} onChange={e => setNewProperty(p => ({ ...p, zip: e.target.value }))} placeholder="00901" />
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Se guardará como propiedad del cliente para futuros estimados, facturas y trabajos.</p>
                  </>
                )}
              </div>
            )}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Áreas del estimado</p>

              {areas.map((area, areaIndex) => (
                <div key={area.key}
                  onDragOver={e => { if (dragItem) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragItem) { moveItem(dragItem.areaKey, dragItem.itemKey, area.key, null); setDragItem(null); } }}
                  style={{ background: 'var(--surface-2)', border: dragItem ? '1px dashed var(--border-strong)' : '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <input value={area.name} onChange={e => updateAreaName(area.key, e.target.value)}
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', border: 'none', background: 'none', padding: 0 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{area.name} Total: {fmt(areaTotal(area))}</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" onClick={() => setAreaMenuOpen(o => o === area.key ? null : area.key)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>⋮</button>
                        {areaMenuOpen === area.key && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setAreaMenuOpen(null)} />
                            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 160, whiteSpace: 'nowrap' }}>
                              <button type="button" disabled={areas.length <= 1}
                                onClick={() => { removeArea(area.key); setAreaMenuOpen(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 12.5, cursor: areas.length <= 1 ? 'default' : 'pointer', borderRadius: 6, color: areas.length <= 1 ? 'var(--muted)' : 'var(--warn)' }}>
                                🗑 Eliminar área
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <LineItemPicker catalogOptions={catalogItems.filter(c => !c.internal_only)} onSelect={item => addFromCatalog(area.key, item)} placeholder="Buscar en catálogo (labor, producto o fee)..." />
                  </div>

                  {area.items.map((item, itemIndex) => {
                    const isGroupHead = !item.parentKey && item.title && item.description.trim() &&
                      area.items.filter(it => !it.parentKey && it.title === item.title).length >= 2 &&
                      area.items.findIndex(it => !it.parentKey && it.title === item.title) === itemIndex;
                    return (
                    <Fragment key={item.key}>
                      {isGroupHead && (
                        <div className="form-group" style={{ marginBottom: 8, marginLeft: 4 }}>
                          <label style={{ fontSize: 11 }}>Descripción para el estimado (opcional — reemplaza el listado automático de "{item.title}" en el documento del cliente)</label>
                          <textarea
                            value={item.group_description || ''}
                            onChange={e => setItem(area.key, item.key, 'group_description', e.target.value)}
                            placeholder="Ej: Materiales de instalación de tubería y accesorios"
                            rows={2}
                            style={{ fontSize: 13, width: '100%' }}
                          />
                        </div>
                      )}
                      {item.parentKey ? (() => {
                      const parent = area.items.find(p => p.key === item.parentKey);
                      const showPricing = parent?.combinePrice === false;
                      return (
                        <LineItemRow
                          key={item.key}
                          isAccessory
                          showPricing={showPricing}
                          description={item.description}
                          onDescriptionChange={v => setItem(area.key, item.key, 'description', v)}
                          catalogOptions={catalogItems.filter(c => !c.internal_only)}
                          datalistId={`est-cat-${areaIndex}-${itemIndex}`}
                          quantity={item.quantity}
                          onQuantityChange={v => setItem(area.key, item.key, 'quantity', v)}
                          msrp={item.msrp}
                          onMsrpChange={v => setItem(area.key, item.key, 'msrp', v)}
                          unitPrice={item.unit_price}
                          onUnitPriceChange={v => setItem(area.key, item.key, 'unit_price', v)}
                          supplierPrice={item.supplier_price}
                          onSupplierPriceChange={v => setItem(area.key, item.key, 'supplier_price', v)}
                          photoUrl={item.photoPreview}
                          onPhotoSelect={file => handleItemPhoto(area.key, item.key, file)}
                          fmt={fmt}
                          actions={
                            <button type="button" onClick={() => removeItem(area.key, item.key)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>×</button>
                          }
                        />
                      );
                    })() : (
                    <div key={item.key}
                      onDragOver={e => { if (dragItem) e.preventDefault(); }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragItem) { moveItem(dragItem.areaKey, dragItem.itemKey, area.key, item.key); setDragItem(null); } }}
                      style={{ opacity: dragItem?.itemKey === item.key ? 0.4 : 1 }}
                    >
                      <LineItemRow
                        type={item.type}
                        onTypeChange={v => setItemType(area.key, item.key, v)}
                        title={item.title}
                        onTitleChange={v => handleTitleCatalogSelect(area.key, item.key, v)}
                        description={item.description}
                        onDescriptionChange={v => handleCatalogSelect(area.key, item.key, v)}
                        catalogOptions={catalogItems.filter(c => c.type === item.type && !c.internal_only)}
                        catalogItemId={item.catalog_item_id}
                        datalistId={`est-cat-${areaIndex}-${itemIndex}`}
                        quantity={item.quantity}
                        onQuantityChange={v => setItem(area.key, item.key, 'quantity', v)}
                        msrp={item.msrp}
                        onMsrpChange={v => setItem(area.key, item.key, 'msrp', v)}
                        unitPrice={item.unit_price}
                        onUnitPriceChange={v => setItem(area.key, item.key, 'unit_price', v)}
                        supplierPrice={item.supplier_price}
                        onSupplierPriceChange={v => setItem(area.key, item.key, 'supplier_price', v)}
                        exempt={item.exempt}
                        onExemptChange={v => setItem(area.key, item.key, 'exempt', v)}
                        saveToCatalog={item.saveToCatalog}
                        onSaveToCatalogChange={v => setItem(area.key, item.key, 'saveToCatalog', v)}
                        vendor={item.vendor}
                        onVendorChange={v => setItem(area.key, item.key, 'vendor', v)}
                        vendorOptions={vendorOptions}
                        photoUrl={item.photoPreview}
                        onPhotoSelect={file => handleItemPhoto(area.key, item.key, file)}
                        fmt={fmt}
                        actions={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button type="button" onClick={() => duplicateItem(area.key, item.key)} title="Duplicar línea" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>⧉</button>
                            <span
                              draggable
                              onDragStart={() => setDragItem({ areaKey: area.key, itemKey: item.key })}
                              onDragEnd={() => setDragItem(null)}
                              title="Arrastrar para mover a otra área"
                              style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 15, padding: '0 4px', userSelect: 'none' }}
                            >⠿</span>
                            <button type="button" onClick={() => removeItem(area.key, item.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                          </div>
                        }
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 32, marginBottom: 8, marginTop: -4 }}>
                        <button type="button" onClick={() => addAccessory(area.key, item.key)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                          + Accesorio
                        </button>
                        {area.items.some(child => child.parentKey === item.key) && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}
                            title="Si está activo, el precio de los accesorios se combina en el total de este producto (no se muestran precios individuales). Si lo desactivas, cada accesorio se cotiza por separado.">
                            <input type="checkbox" checked={item.combinePrice !== false}
                              onChange={e => setItem(area.key, item.key, 'combinePrice', e.target.checked)} />
                            Combinar precio de accesorios
                          </label>
                        )}
                      </div>
                    </div>
                    )}
                    </Fragment>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key, { type: 'product', tax_category: 'product' })}>+ Añadir producto</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key)}>+ Añadir labor</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setCableCalcTarget({ areaKey: area.key })}>🧮 Calcular cable/tubo</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addArea}>+ Agregar área</button>
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Términos del proyecto</p>
              <div className="form-group">
                <select
                  value=""
                  onChange={e => {
                    const tpl = TERMS_TEMPLATES.find(t => t.key === e.target.value);
                    if (tpl) set('terms', tpl.text);
                  }}
                  style={{ marginBottom: 8 }}
                >
                  <option value="">— Elegir plantilla —</option>
                  {TERMS_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <textarea value={form.terms} onChange={e => set('terms', e.target.value)} rows={6} style={{ fontSize: 13, lineHeight: 1.6 }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <TaxBreakdown
                lineas={flatItemsForTax} clientType={clientType} taxRules={taxRules} title="Resumen IVU"
                note={clientType === 'b2b' && (
                  <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                    Cliente B2B — Labor al 4%
                  </div>
                )}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : '💾 Guardar estimado'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
        {cableCalcTarget && (
          <CableCalculator
            vendorOptions={vendorOptions}
            catalogItems={catalogItems}
            onAdd={item => { addPrefilledItem(cableCalcTarget.areaKey, item); setCableCalcTarget(null); }}
            onClose={() => setCableCalcTarget(null)}
          />
        )}
      </main>
    </div>
  );
}
