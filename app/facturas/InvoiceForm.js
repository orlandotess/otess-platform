'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import ClientCombobox from './nueva/ClientCombobox';
import LineItemRow from '../LineItemRow';
import LineItemPicker from '../LineItemPicker';
import TaxBreakdown from '../TaxBreakdown';
import { calcularIVU, tasaParaLinea, aplicarDescuento } from '../../lib/tax';

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
    unit_price: '', msrp: '', supplier_price: '', exempt: false, vendor: '', catalog_item_id: null, saveToCatalog: !overrides.catalog_item_id,
    photoFile: null, photoPreview: null, existingPhotoPath: null,
    ...overrides,
  };
}
function emptyArea(name = 'Área 1') {
  return { key: Math.random().toString(36).slice(2), name, items: [emptyItem()] };
}
// Rebuilds the local {areas: [{name, items}]} builder shape from a flat list
// of line items (loaded from invoice_line_items or job_line_items), grouping
// by each item's `area` tag — same grouping EstimateForm.js/ProposalDocument.js
// use. Accessories (parent_item_id children) are re-linked to their parent's
// freshly-minted local key right after it.
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
      combinePrice: li.combine_price !== false,
      photoPreview: li.photo_signed_url ?? null, existingPhotoPath: li.photo_url ?? null,
    });
    area.items.push(parent);
    rows.filter(c => c.parent_item_id === li.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach(child => {
      area.items.push(emptyItem({
        parentKey: parent.key,
        type: child.type, tax_category: child.tax_category ?? child.type, description: child.description,
        quantity: child.quantity, unit_price: child.unit_price,
        msrp: child.msrp ?? '', supplier_price: child.supplier_price ?? '', exempt: !!child.exempt_reason,
        catalog_item_id: child.catalog_item_id ?? null,
        photoPreview: child.photo_signed_url ?? null, existingPhotoPath: child.photo_url ?? null,
      }));
    });
  });
  return areas.length ? areas : [emptyArea()];
}

export default function InvoiceForm({ initialData = null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');
  const isEdit = !!initialData;

  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [form, setForm] = useState(initialData ? {
    client_id: initialData.invoice.client_id ?? '', job_id: initialData.invoice.job_id ?? '',
    notes: initialData.invoice.notes ?? '', work_description: initialData.invoice.work_description ?? '',
    bill_to: initialData.invoice.bill_to ?? 'person', terms: initialData.invoice.terms ?? '',
    issued_at: initialData.invoice.issued_at ?? new Date().toISOString().split('T')[0],
    due_at: initialData.invoice.due_at ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    discount_type: initialData.invoice.discount_type ?? 'amount',
    discount_value: initialData.invoice.discount_value ?? '',
    discount_note: initialData.invoice.discount_note ?? '',
  } : {
    client_id: '', job_id: '', notes: '', work_description: '', bill_to: 'person', terms: '',
    invoice_number: '',
    issued_at: new Date().toISOString().split('T')[0],
    due_at: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    discount_type: 'amount', discount_value: '', discount_note: '',
  });
  const [areas, setAreas] = useState(initialData?.items?.length ? itemsToAreas(initialData.items) : [emptyArea()]);
  const [areaMenuOpen, setAreaMenuOpen] = useState(null);
  const [dragItem, setDragItem] = useState(null); // { areaKey, itemKey } — item currently being dragged
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Product quantities this invoice already had reserved before this edit —
  // used so the stock-shortage check compares against what would be available
  // after this invoice's old deduction is restored, not the currently-reduced stock.
  const oldQtyByCatalogId = (initialData?.items ?? []).reduce((m, li) => {
    if (li.type === 'product' && li.catalog_item_id) m[li.catalog_item_id] = (m[li.catalog_item_id] ?? 0) + Number(li.quantity ?? 0);
    return m;
  }, {});

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type, report_name_source').order('name').then(({ data }) => setClients(data ?? []));
    supabase.from('jobs').select('id, title, description, client_id, bill_to, job_line_items(*)').order('created_at', { ascending: false }).then(({ data }) => setJobs(data ?? []));
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    supabase.from('tax_rules').select('client_type, line_item_type, rate').then(({ data }) => setTaxRules(data ?? []));
    if (!isEdit) {
      supabase.from('invoices').select('invoice_number').then(({ data }) => {
        let maxNum = 999;
        (data ?? []).forEach(inv => {
          const match = inv.invoice_number?.match(/^INV-(\d+)$/);
          if (match) {
            const n = parseInt(match[1]);
            if (n > maxNum) maxNum = n;
          }
        });
        setForm(f => (f.invoice_number ? f : { ...f, invoice_number: `INV-${maxNum + 1}` }));
      });
    }
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
    if (!isEdit && jobIdParam && jobs.length) {
      const job = jobs.find(j => j.id === jobIdParam);
      if (job) {
        setForm(f => ({ ...f, job_id: job.id, client_id: job.client_id, bill_to: job.bill_to ?? 'person', work_description: job.description ?? '' }));
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
    setAreas(prev => prev.map(a => a.key === areaKey
      ? { ...a, items: a.items.map(it => it.key === itemKey ? { ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null } : it) }
      : a));
  }
  // Si el ítem del catálogo tiene foto y la línea todavía no tiene una propia,
  // la copia (vía signed URL) en vez de dejar la línea sin foto.
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
  // Every line — parent or accessory — always carries its own real weight in
  // the total; "Combinar precios" only controls whether accessories get
  // itemized on the client-facing document (see groupItemsForDisplay in
  // app/facturas/[id]/page.js), never whether their cost is counted.
  function itemLineTotal(it) {
    return (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  }
  function areaTotal(area) {
    return area.items.reduce((s, it) => s + itemLineTotal(it), 0);
  }
  const t = calcularIVU(flatItems, clientType, taxRules);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_id) { setError('Selecciona un cliente'); return; }
    if (!isEdit && !form.invoice_number.trim()) { setError('Ingresa un número de factura'); return; }
    if (!flatItems.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    if (flatItems.some(i => !i.description.trim())) { setError('Todas las líneas necesitan una descripción antes de guardar.'); return; }

    const shortages = flatItems.filter(i => i.type === 'product' && i.catalog_item_id).map(i => {
      const cat = catalogItems.find(c => c.id === i.catalog_item_id);
      const requested = parseFloat(i.quantity) || 0;
      const available = cat?.stock_quantity != null ? cat.stock_quantity + (oldQtyByCatalogId[i.catalog_item_id] ?? 0) : null;
      return cat && available != null && requested > available
        ? `${cat.description}: pedido ${requested}, disponible ${available}`
        : null;
    }).filter(Boolean);
    if (shortages.length && !confirm(`Stock insuficiente para:\n${shortages.join('\n')}\n\n¿Guardar la factura de todas formas?`)) {
      return;
    }

    setSaving(true); setError('');

    // invoices no tiene columnas propias para "reembolso" — se pliega en
    // subtotal_products (pass-through a costo, tasa 0% así que no afecta
    // tax_products) en vez de abrir una migración más grande sobre las 7
    // tablas de documentos solo para esta categoría, hoy usada por 1 de 11
    // fees. El total de la factura sigue siendo exacto; lib/ivu.js (reportes
    // de /accounting) no cambia su comportamiento.
    const productCat = t.categorias.find(c => c.codigo === 'product');
    const laborCat = t.categorias.find(c => c.codigo === 'labor');
    const reembolsoCat = t.categorias.find(c => c.codigo === 'reembolso');
    const { discountAmount, finalTotal } = aplicarDescuento(t.total, form.discount_type, form.discount_value);
    const aggTotals = {
      subtotal_products: productCat.base + reembolsoCat.base,
      tax_products: productCat.impuesto + reembolsoCat.impuesto,
      subtotal_labor: laborCat.base,
      tax_labor: laborCat.impuesto,
      total: finalTotal,
      discount_type: discountAmount > 0 ? form.discount_type : null,
      discount_value: discountAmount > 0 ? (parseFloat(form.discount_value) || 0) : null,
      discount_note: form.discount_note || null,
    };

    let invoice;
    if (isEdit) {
      const { data: current } = await supabase.from('invoices').select('status').eq('id', initialData.invoice.id).single();
      if (!current || !['draft', 'sent'].includes(current.status)) {
        setError('Esta factura ya no se puede editar (fue pagada o cancelada).');
        setSaving(false);
        return;
      }
      const { data: updated, error: err } = await supabase.from('invoices').update({
        client_id: form.client_id,
        job_id: form.job_id || null,
        notes: form.notes || null,
        work_description: form.work_description || null,
        terms: form.terms || null,
        issued_at: form.issued_at,
        due_at: form.due_at,
        bill_to: form.bill_to,
        ...aggTotals,
      }).eq('id', initialData.invoice.id).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      invoice = updated;

      // Restore stock this invoice previously reserved before wiping its old lines —
      // the deduction below re-applies it against the edited quantities.
      const { data: oldLineItems } = await supabase.from('invoice_line_items').select('catalog_item_id, quantity, type, catalog_items(default_location_id)').eq('invoice_id', invoice.id);
      for (const li of (oldLineItems ?? []).filter(li => li.type === 'product' && li.catalog_item_id)) {
        await supabase.rpc('adjust_catalog_stock', {
          p_catalog_item_id: li.catalog_item_id,
          p_delta: li.quantity,
          p_invoice_id: invoice.id,
          p_reason: 'invoice_edited',
          p_location_id: li.catalog_items?.default_location_id ?? null,
        });
      }
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id);
    } else {
      const invoiceNumber = form.invoice_number.trim();
      const { data: dupe } = await supabase.from('invoices').select('id').eq('invoice_number', invoiceNumber).maybeSingle();
      if (dupe) { setError(`Ya existe una factura con el número ${invoiceNumber}`); setSaving(false); return; }

      const { data: created, error: err } = await supabase.from('invoices').insert([{
        invoice_number: invoiceNumber,
        client_id: form.client_id,
        job_id: form.job_id || null,
        notes: form.notes || null,
        work_description: form.work_description || null,
        terms: form.terms || null,
        issued_at: form.issued_at,
        due_at: form.due_at,
        status: 'draft',
        bill_to: form.bill_to,
        ...aggTotals,
      }]).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      invoice = created;
    }

    async function uploadItemPhoto(i, sortOrder) {
      if (!i.photoFile) return i.existingPhotoPath ?? null;
      const ext = i.photoFile.name.split('.').pop();
      const path = `${invoice.id}/${Date.now()}-${sortOrder}.${ext}`;
      const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
      return upErr ? null : path;
    }

    // Ítems marcados "☑ Guardar en catálogo" que no vienen de una selección
    // del picker (catalog_item_id vacío) se crean en catalog_items aquí,
    // mismo criterio que /catalogo: código = título, nombre en blanco. Si ya
    // existe un ítem con ese código+tipo se reusa en vez de duplicar. No
    // bloquea el guardado de la factura si la creación falla.
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
    // accessories' parent_item_id in a second pass. Stock deductions for both
    // parents and accessories (an accessory can itself be a catalog product)
    // are collected along the way and applied once every line has saved.
    let sortOrder = 0;
    let liErr = null;
    const keyToId = {};
    const stockDeductions = [];
    for (const area of areas) {
      for (const i of area.items.filter(it => !it.parentKey && it.description.trim())) {
        const photoPath = await uploadItemPhoto(i, sortOrder);
        const base = itemLineTotal(i);
        const rate = tasaParaLinea(i, clientType, taxRules);
        const { data: row, error: err } = await supabase.from('invoice_line_items').insert([{
          invoice_id: invoice.id, type: i.type, tax_category: i.tax_category || i.type, title: i.title || null, description: i.description,
          quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
          msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
          supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
          exempt_reason: i.exempt ? 'Exento' : null,
          area: area.name || null, vendor: i.vendor || null, catalog_item_id: i.catalog_item_id || null,
          combine_price: i.combinePrice !== false,
          photo_url: photoPath,
          tax_rate: rate, line_total: base, tax_amount: base * rate,
          sort_order: sortOrder++,
        }]).select().single();
        if (err) { liErr = err; break; }
        if (row) {
          keyToId[i.key] = row.id;
          if (i.type === 'product' && i.catalog_item_id) stockDeductions.push({ catalog_item_id: i.catalog_item_id, quantity: parseFloat(i.quantity) || 1 });
        }
      }
      if (liErr) break;
    }
    if (!liErr) {
      for (const area of areas) {
        for (const i of area.items.filter(it => it.parentKey && it.description.trim() && keyToId[it.parentKey])) {
          const photoPath = await uploadItemPhoto(i, sortOrder);
          const base = itemLineTotal(i);
          const rate = tasaParaLinea(i, clientType, taxRules);
          const { error: err } = await supabase.from('invoice_line_items').insert([{
            invoice_id: invoice.id, type: i.type, tax_category: i.tax_category || i.type, description: i.description,
            quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
            msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
            supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
            exempt_reason: i.exempt ? 'Exento' : null,
            area: area.name || null, parent_item_id: keyToId[i.parentKey], catalog_item_id: i.catalog_item_id || null,
            photo_url: photoPath,
            tax_rate: rate, line_total: base, tax_amount: base * rate,
            sort_order: sortOrder++,
          }]);
          if (err) { liErr = err; break; }
          if (i.type === 'product' && i.catalog_item_id) stockDeductions.push({ catalog_item_id: i.catalog_item_id, quantity: parseFloat(i.quantity) || 1 });
        }
        if (liErr) break;
      }
    }
    if (liErr) {
      setError(`La factura ${invoice.invoice_number} se guardó pero no se pudieron guardar sus líneas: ${liErr.message}. Ábrela y agrégalas manualmente.`);
      setSaving(false);
      return;
    }

    for (const { catalog_item_id, quantity } of stockDeductions) {
      const cat = catalogItems.find(c => c.id === catalog_item_id);
      await supabase.rpc('adjust_catalog_stock', {
        p_catalog_item_id: catalog_item_id,
        p_delta: -quantity,
        p_invoice_id: invoice.id,
        p_reason: isEdit ? 'invoice_edited' : 'invoice_created',
        p_location_id: cat?.default_location_id ?? null,
      });
    }

    router.push(`/facturas/${invoice.id}`);
  }

  return (
    <div className="admin-shell ds-facturas">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">{isEdit ? `Editar factura ${initialData.invoice.invoice_number}` : 'Nueva factura'}</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <ClientCombobox clients={clients} value={form.client_id} onChange={id => { const c = clients.find(cl => cl.id === id); set('client_id', id); set('bill_to', c?.report_name_source === 'company' ? 'company' : 'person'); }} />
                </div>
                <div className="form-group">
                  <label>Trabajo (opcional)</label>
                  <select value={form.job_id} onChange={e => {
                    const jid = e.target.value;
                    const job = jobs.find(j => j.id === jid);
                    setForm(f => ({ ...f, job_id: jid, work_description: job?.description ?? '' }));
                  }}>
                    <option value="">— Sin trabajo asociado —</option>
                    {jobs.filter(j => !form.client_id || j.client_id === form.client_id).map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {hasCompany && (
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label>Facturar a</label>
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
                {!isEdit && (
                  <div className="form-group">
                    <label>Número de factura</label>
                    <input type="text" value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="INV-1000" />
                  </div>
                )}
                <div className="form-group">
                  <label>Fecha emisión</label>
                  <input type="date" value={form.issued_at} onChange={e => set('issued_at', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Fecha vencimiento</label>
                  <input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Descripción del trabajo (visible para el cliente)</label>
                <textarea value={form.work_description} onChange={e => set('work_description', e.target.value)} placeholder="Detalle de lo realizado en la propiedad..." rows={4} />
              </div>
              <div className="form-group">
                <label>Notas / Términos de pago</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Términos de pago, notas para el cliente..." />
              </div>
            </div>

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Áreas de la factura</p>

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

                  {area.items.map((item, itemIndex) => (
                    item.parentKey ? (() => {
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
                          datalistId={`inv-cat-${areaIndex}-${itemIndex}`}
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
                        datalistId={`inv-cat-${areaIndex}-${itemIndex}`}
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
                    )
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key, { type: 'product', tax_category: 'product' })}>+ Añadir producto</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => addItem(area.key)}>+ Añadir labor</button>
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
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Descuento (opcional)</p>
              <div className="form-row">
                <div className="form-group" style={{ maxWidth: 110 }}>
                  <label>Tipo</label>
                  <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
                    <option value="amount">$</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{form.discount_type === 'percent' ? 'Porcentaje' : 'Monto'}</label>
                  <input type="number" min="0" step="0.01" value={form.discount_value}
                    onChange={e => set('discount_value', e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group">
                <label>Nota del descuento</label>
                <input value={form.discount_note} onChange={e => set('discount_note', e.target.value)}
                  placeholder="Ej: Descuento por referido, promoción de verano..." />
              </div>
            </div>
            <div className="card">
              <TaxBreakdown
                lineas={flatItems} clientType={clientType} taxRules={taxRules} title="Resumen IVU"
                discountType={form.discount_type} discountValue={form.discount_value} discountNote={form.discount_note}
                note={clientType === 'b2b' && (
                  <div style={{ background: 'var(--info-tint)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                    Cliente B2B — Labor al 4%
                  </div>
                )}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : '💾 Guardar factura'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
