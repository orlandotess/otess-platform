'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../Sidebar';
import LineItemRow from '../LineItemRow';

const TAX = { final_product: 0.115, final_labor: 0.115, b2b_product: 0.115, b2b_labor: 0.04 };

const DEFAULT_TERMS = `Esta orden de cambio representa trabajo adicional o modificado fuera del alcance original acordado. Al aprobarla, el cliente autoriza a OTESS a proceder con el trabajo descrito y acepta el cargo adicional indicado.`;

function emptyItem() {
  return { type: 'labor', description: '', quantity: 1, unit_price: '', msrp: '', supplier_price: '', exempt: false, area: '', vendor: '', catalog_item_id: null, photoFile: null, photoPreview: null, existingPhotoPath: null };
}

export default function ChangeOrderForm({ initialData = null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');
  const isEdit = !!initialData;

  const [job, setJob] = useState(initialData ? {
    id: initialData.order.job_id,
    title: initialData.order.jobs?.title,
    client_id: initialData.order.client_id,
    client_name: initialData.order.clients?.name,
    client_type: initialData.order.clients?.client_type,
  } : null);
  const [catalogItems, setCatalogItems] = useState([]);
  const [title, setTitle] = useState(initialData?.order.title ?? '');
  const [preparedBy, setPreparedBy] = useState(initialData?.order.prepared_by ?? '');
  const [introNote, setIntroNote] = useState(initialData?.order.intro_note ?? '');
  const [requiresSignature, setRequiresSignature] = useState(initialData?.order.requires_signature ?? false);
  const [billTo, setBillTo] = useState(initialData?.order.bill_to ?? 'person');
  const [validUntil, setValidUntil] = useState(initialData?.order.valid_until ?? '');
  const [terms, setTerms] = useState(initialData?.order.terms ?? DEFAULT_TERMS);
  const [items, setItems] = useState(
    initialData?.items?.length
      ? initialData.items.map(li => ({
          type: li.type, description: li.description, quantity: li.quantity, unit_price: li.unit_price,
          msrp: li.msrp ?? '', supplier_price: li.supplier_price ?? '', exempt: !!li.exempt_reason,
          area: li.area ?? '', vendor: li.vendor ?? '', catalog_item_id: li.catalog_item_id ?? null,
          photoFile: null, photoPreview: li.photo_signed_url ?? null, existingPhotoPath: li.photo_url ?? null,
        }))
      : [emptyItem()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('catalog_items').select('*').order('item_code').then(({ data }) => setCatalogItems(data ?? []));
    if (!isEdit && jobIdParam) {
      supabase.from('jobs').select('id, title, client_id, bill_to, clients(name, client_type)').eq('id', jobIdParam).single().then(({ data }) => {
        if (data) { setJob({ id: data.id, title: data.title, client_id: data.client_id, client_name: data.clients?.name, client_type: data.clients?.client_type }); setBillTo(data.bill_to ?? 'person'); }
      });
    }
  }, []);

  const addItem = () => setItems(i => [...i, emptyItem()]);
  const removeItem = idx => setItems(i => i.filter((_, n) => n !== idx));
  const setItem = (idx, k, v) => setItems(i => i.map((it, n) => n === idx ? { ...it, [k]: v } : it));
  function handleItemPhoto(idx, file) {
    if (!file) return;
    setItems(i => i.map((it, n) => n === idx ? { ...it, photoFile: file, photoPreview: URL.createObjectURL(file), existingPhotoPath: null } : it));
  }
  function handleCatalogSelect(idx, value) {
    const match = catalogItems.find(c => `${c.item_code} — ${c.description}` === value);
    if (match) {
      setItems(i => i.map((it, n) => n === idx ? {
        ...it, description: match.description, unit_price: match.price ?? '', msrp: match.msrp ?? '', supplier_price: match.supplier_price ?? '',
        vendor: it.vendor || match.vendor || '', catalog_item_id: match.id,
      } : it));
    } else {
      setItems(i => i.map((it, n) => n === idx ? { ...it, description: value, catalog_item_id: null } : it));
    }
  }

  const clientType = job?.client_type === 'b2b' ? 'b2b' : 'final';
  const calcTotals = () => {
    let subProd = 0, taxProd = 0, subLabor = 0, taxLabor = 0;
    items.forEach(it => {
      const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
      const rate = it.exempt ? 0 : (TAX[`${clientType}_${it.type}`] ?? 0.115);
      if (it.type === 'product') { subProd += base; taxProd += base * rate; }
      else { subLabor += base; taxLabor += base * rate; }
    });
    return { subProd, taxProd, subLabor, taxLabor, total: subProd + taxProd + subLabor + taxLabor };
  };
  const t = calcTotals();
  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const areaOptions = [...new Set(items.map(i => i.area).filter(Boolean))];
  const vendorOptions = [...new Set(catalogItems.map(i => i.vendor).filter(Boolean))];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!job) { setError('Falta el trabajo asociado'); return; }
    if (!title.trim()) { setError('El título es requerido'); return; }
    if (!items.some(i => i.description.trim())) { setError('Agrega al menos una línea'); return; }
    setSaving(true); setError('');

    let order;
    if (isEdit) {
      const { data: current } = await supabase.from('change_orders').select('status').eq('id', initialData.order.id).single();
      if (!current || !['borrador', 'enviada', 'vista'].includes(current.status)) {
        setError('Esta orden de cambio ya no se puede editar (fue aprobada o rechazada).');
        setSaving(false);
        return;
      }
      const { data: updated, error: err } = await supabase.from('change_orders').update({
        title: title.trim(),
        prepared_by: preparedBy.trim() || null,
        intro_note: introNote.trim() || null,
        requires_signature: requiresSignature,
        bill_to: billTo,
        valid_until: validUntil || null,
        terms: terms || null,
        subtotal_products: t.subProd, tax_products: t.taxProd,
        subtotal_labor: t.subLabor, tax_labor: t.taxLabor, total: t.total,
      }).eq('id', initialData.order.id).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      order = updated;
      await supabase.from('change_order_line_items').delete().eq('change_order_id', order.id);
    } else {
      const { data: last } = await supabase.from('change_orders').select('change_order_number').order('created_at', { ascending: false }).limit(1).single();
      let nextNum = 1001;
      if (last?.change_order_number) {
        const n = parseInt(last.change_order_number.replace('CO-', ''));
        if (!isNaN(n)) nextNum = n + 1;
      }
      const { data: created, error: err } = await supabase.from('change_orders').insert([{
        change_order_number: `CO-${nextNum}`,
        job_id: job.id,
        client_id: job.client_id,
        title: title.trim(),
        prepared_by: preparedBy.trim() || null,
        intro_note: introNote.trim() || null,
        requires_signature: requiresSignature,
        status: 'borrador',
        bill_to: billTo,
        valid_until: validUntil || null,
        terms: terms || null,
        subtotal_products: t.subProd, tax_products: t.taxProd,
        subtotal_labor: t.subLabor, tax_labor: t.taxLabor, total: t.total,
      }]).select().single();
      if (err) { setError(err.message); setSaving(false); return; }
      order = created;
    }

    const lineItems = [];
    let sortOrder = 0;
    for (const i of items.filter(i => i.description.trim())) {
      let photoPath = i.existingPhotoPath ?? null;
      if (i.photoFile) {
        const ext = i.photoFile.name.split('.').pop();
        const path = `change-orders/${order.id}/${Date.now()}-${sortOrder}.${ext}`;
        const { error: upErr } = await supabase.storage.from('Job-photos').upload(path, i.photoFile);
        if (!upErr) photoPath = path;
      }
      const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0);
      const rate = i.exempt ? 0 : (TAX[`${clientType}_${i.type}`] ?? 0.115);
      lineItems.push({
        change_order_id: order.id, type: i.type, description: i.description,
        quantity: parseFloat(i.quantity) || 1, unit_price: parseFloat(i.unit_price) || 0,
        msrp: i.msrp !== '' ? parseFloat(i.msrp) : null,
        supplier_price: i.supplier_price !== '' ? parseFloat(i.supplier_price) : null,
        exempt_reason: i.exempt ? 'Exento' : null,
        area: i.area || null, vendor: i.vendor || null, catalog_item_id: i.catalog_item_id || null,
        photo_url: photoPath,
        tax_rate: rate, line_total: base, tax_amount: base * rate,
        sort_order: sortOrder++,
      });
    }
    await supabase.from('change_order_line_items').insert(lineItems);
    router.push(`/ordenes-cambio/${order.id}`);
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header"><div className="page-title">{isEdit ? 'Editar orden de cambio' : 'Nueva orden de cambio'}</div></div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <p style={{ color: 'var(--warn)', fontSize: 14 }}>{error}</p>}

            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Información general</p>
              {job ? (
                <div style={{ padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Trabajo</div>
                  <div style={{ fontWeight: 600 }}>{job.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{job.client_name}</div>
                </div>
              ) : (
                <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 16 }}>Esta orden de cambio debe crearse desde la página de un trabajo.</p>
              )}

              <div className="form-group">
                <label>Título *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Cableado adicional segundo piso" />
              </div>
              <div className="form-group">
                <label>Preparado por</label>
                <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Nombre de quien prepara" style={{ maxWidth: 300 }} />
              </div>
              <div className="form-group">
                <label>Nota para el cliente</label>
                <textarea value={introNote} onChange={e => setIntroNote(e.target.value)} placeholder="Explica el motivo del cambio..." />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Válida hasta</label>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                <input type="checkbox" checked={requiresSignature} onChange={e => setRequiresSignature(e.target.checked)} />
                Requiere firma del cliente
              </label>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Términos</label>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={5} style={{ fontSize: 13, lineHeight: 1.6 }} />
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Líneas de la orden de cambio</p>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addItem}>+ Agregar línea</button>
              </div>
              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  type={item.type}
                  onTypeChange={v => setItem(idx, 'type', v)}
                  description={item.description}
                  onDescriptionChange={v => handleCatalogSelect(idx, v)}
                  catalogOptions={catalogItems.filter(c => c.type === item.type)}
                  catalogItemId={item.catalog_item_id}
                  datalistId={`co-cat-${idx}`}
                  quantity={item.quantity}
                  onQuantityChange={v => setItem(idx, 'quantity', v)}
                  msrp={item.msrp}
                  onMsrpChange={v => setItem(idx, 'msrp', v)}
                  unitPrice={item.unit_price}
                  onUnitPriceChange={v => setItem(idx, 'unit_price', v)}
                  supplierPrice={item.supplier_price}
                  onSupplierPriceChange={v => setItem(idx, 'supplier_price', v)}
                  exempt={item.exempt}
                  onExemptChange={v => setItem(idx, 'exempt', v)}
                  area={item.area}
                  onAreaChange={v => setItem(idx, 'area', v)}
                  areaOptions={areaOptions}
                  vendor={item.vendor}
                  onVendorChange={v => setItem(idx, 'vendor', v)}
                  vendorOptions={vendorOptions}
                  photoUrl={item.photoPreview}
                  onPhotoSelect={file => handleItemPhoto(idx, file)}
                  fmt={fmt}
                  actions={
                    <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  }
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Resumen IVU</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal productos</span><span>{fmt(t.subProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU productos (11.5%)</span><span>{fmt(t.taxProd)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal labor</span><span>{fmt(t.subLabor)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>IVU labor ({clientType === 'b2b' ? '4%' : '11.5%'})</span><span>{fmt(t.taxLabor)}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                  <span>Total</span><span style={{ color: 'var(--navy)' }}>{fmt(t.total)}</span>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving || !job} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              {saving ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : '💾 Guardar orden de cambio'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
