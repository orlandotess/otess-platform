"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { supabase } from "../../lib/supabase";
import ViewToggle, { useCatalogView } from "../ViewToggle";
import CatalogoView from "../CatalogoView";

const TYPE_META_BASE = {
  labor: { icon: "🔧", color: "#e0972c" },
  product: { icon: "📦", color: "#2a4cb5" },
  fee: { icon: "🧾", color: "#16223d" },
  catalog_view: { icon: "🗂️", color: "#0e8f7a" },
};

const LOCATION_ICONS = { warehouse: "🏢", site: "📍", van: "🚐", zone: "🗂️", shelf: "📚", bin: "🗃️" };

export default function CatalogoClient({ items: initial, locations = [], locationStock = [], locationReels = [] }) {
  const t = useTranslations("catalogo.client");
  const [items, setItems] = useState(initial);
  const [reels, setReels] = useState(locationReels);
  const [reelsModalItem, setReelsModalItem] = useState(null);
  const [newReel, setNewReel] = useState({ location_id: "", code: "", total_footage: "" });
  const [reelFootageInputs, setReelFootageInputs] = useState({});
  const [savingReel, setSavingReel] = useState(false);
  const [reelError, setReelError] = useState("");
  const [tab, setTab] = useState("labor");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ item_code: "", name: "", description: "", price: "", msrp: "", supplier_price: "", markup_pct: "", vendor: "", stock_quantity: "", default_location_id: "", internal_only: false, tax_category: "labor", costo: "", recurrencia: "unica", termino_meses: "" });
  const [feeView, setFeeView] = useCatalogView("list");
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [signedUrls, setSignedUrls] = useState({});
  const fileRef = useRef();
  const newPhotoRef = useRef();
  const editPhotoRef = useRef();

  const dataType = tab === "catalog_view" ? "product" : tab;
  const isCardView = tab === "catalog_view";

  // Fees es una agrupación de presentación (`type`), no una categoría fiscal —
  // tax_category (cómo se grava: labor/product/reembolso) es un eje aparte.
  // Ver migrations/2026-08-02-fees-tax-category.sql y lib/tax.js.
  const typeMeta = useMemo(() => ({
    labor: { ...TYPE_META_BASE.labor, label: t("types.labor") },
    product: { ...TYPE_META_BASE.product, label: t("types.product") },
    fee: { ...TYPE_META_BASE.fee, label: t("types.fee") },
    catalog_view: { ...TYPE_META_BASE.catalog_view, label: t("types.catalogView") },
  }), [t]);

  const taxCategoryMeta = useMemo(() => ({
    labor: { label: t("taxCategory.labor") },
    product: { label: t("taxCategory.product") },
    reembolso: { label: t("taxCategory.reembolso") },
  }), [t]);

  const recurrenciaLabels = useMemo(() => ({
    unica: t("recurrencia.unica"),
    mensual: t("recurrencia.mensual"),
    anual: t("recurrencia.anual"),
  }), [t]);

  const locationsById = useMemo(() => {
    const map = {};
    for (const l of locations) map[l.id] = l;
    return map;
  }, [locations]);

  // Lista plana e indentada de ubicaciones activas, para el selector "Ubicación".
  const flatLocationOptions = useMemo(() => {
    const childrenOf = {};
    for (const l of locations) {
      const key = l.parent_id ?? "__root__";
      if (!childrenOf[key]) childrenOf[key] = [];
      childrenOf[key].push(l);
    }
    const out = [];
    function walk(parentKey, depth) {
      for (const l of [...(childrenOf[parentKey] ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ id: l.id, label: `${"—".repeat(depth)} ${LOCATION_ICONS[l.type] ?? ""} ${l.name}`.trim() });
        walk(l.id, depth + 1);
      }
    }
    walk("__root__", 0);
    return out;
  }, [locations]);

  function locationBreakdown(itemId) {
    return locationStock.filter(s => s.catalog_item_id === itemId && s.quantity !== 0);
  }

  function reelsForItem(itemId) {
    return reels.filter(r => r.catalog_item_id === itemId);
  }

  function openReelsModal(item) {
    setReelsModalItem(item);
    setNewReel({ location_id: item.default_location_id ?? "", code: "", total_footage: "" });
    setReelFootageInputs({});
    setReelError("");
  }

  async function addReel() {
    if (!reelsModalItem || !newReel.location_id || !newReel.total_footage) return;
    setSavingReel(true);
    setReelError("");
    const { data, error } = await supabase.rpc("add_stock_reel", {
      p_catalog_item_id: reelsModalItem.id,
      p_location_id: newReel.location_id,
      p_total_footage: parseFloat(newReel.total_footage),
      p_code: newReel.code.trim() || null,
    });
    setSavingReel(false);
    if (error) { setReelError(t("errorAlert", { message: error.message })); return; }
    const footage = parseFloat(newReel.total_footage);
    setReels(prev => [{
      id: data, location_id: newReel.location_id, catalog_item_id: reelsModalItem.id,
      code: newReel.code.trim() || null, total_footage: footage, remaining_footage: footage,
    }, ...prev]);
    // Mantiene items[].stock_quantity al día — si no, un "Editar" posterior sobre
    // este mismo ítem reenviaría el Stock viejo (desactualizado) y sobreescribiría
    // el agregado real que acaba de mover add_stock_reel en la base de datos.
    setItems(prev => prev.map(i => i.id === reelsModalItem.id ? { ...i, stock_quantity: (i.stock_quantity ?? 0) + footage } : i));
    setNewReel({ location_id: newReel.location_id, code: "", total_footage: "" });
  }

  async function useReelFootage(reel) {
    const footage = parseFloat(reelFootageInputs[reel.id]);
    if (!footage || footage <= 0) return;
    setSavingReel(true);
    setReelError("");
    const { error } = await supabase.rpc("use_reel_footage", { p_reel_id: reel.id, p_footage: footage });
    setSavingReel(false);
    if (error) { setReelError(t("errorAlert", { message: error.message })); return; }
    setReels(prev => prev.map(r => r.id === reel.id ? { ...r, remaining_footage: r.remaining_footage - footage } : r));
    setItems(prev => prev.map(i => i.id === reel.catalog_item_id ? { ...i, stock_quantity: (i.stock_quantity ?? 0) - footage } : i));
    setReelFootageInputs(prev => ({ ...prev, [reel.id]: "" }));
  }

  async function deleteReel(reel) {
    if (!confirm(t("confirmDeleteReel"))) return;
    setSavingReel(true);
    const { error } = await supabase.rpc("delete_stock_reel", { p_reel_id: reel.id });
    setSavingReel(false);
    if (error) { alert(t("errorAlert", { message: error.message })); return; }
    setReels(prev => prev.filter(r => r.id !== reel.id));
    setItems(prev => prev.map(i => i.id === reel.catalog_item_id ? { ...i, stock_quantity: (i.stock_quantity ?? 0) - reel.remaining_footage } : i));
  }

  // Recalcula Precio venta = Costo * (1 + Markup%/100) cuando cambia el costo
  // o el markup; el precio sigue siendo editable a mano por encima de esto.
  function applyMarkup(setFn, patch) {
    setFn(f => {
      const next = { ...f, ...patch };
      const cost = parseFloat(next.supplier_price);
      const pct = parseFloat(next.markup_pct);
      if (!isNaN(cost) && cost > 0 && !isNaN(pct)) {
        next.price = (cost * (1 + pct / 100)).toFixed(2);
      }
      return next;
    });
  }

  const counts = { labor: items.filter(i => i.type === "labor").length, product: items.filter(i => i.type === "product").length, fee: items.filter(i => i.type === "fee").length };
  counts.catalog_view = counts.product;

  const filtered = items.filter(i => i.type === dataType && (
    i.item_code.toLowerCase().includes(search.toLowerCase()) ||
    (i.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase())
  ));

  // Genera signed URLs para las fotos de los ítems visibles
  useEffect(() => {
    const missing = filtered.filter(i => i.photo_url && !signedUrls[i.photo_url]);
    if (missing.length === 0) return;
    (async () => {
      const updates = {};
      for (const it of missing) {
        const { data } = await supabase.storage.from("Job-photos").createSignedUrl(it.photo_url, 3600);
        if (data?.signedUrl) updates[it.photo_url] = data.signedUrl;
      }
      if (Object.keys(updates).length) setSignedUrls(prev => ({ ...prev, ...updates }));
    })();
  }, [filtered]);

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({ item_code: item.item_code, name: item.name ?? "", description: item.description, price: item.price, msrp: item.msrp ?? "", supplier_price: item.supplier_price ?? "", markup_pct: item.markup_pct ?? "", vendor: item.vendor ?? "", stock_quantity: item.stock_quantity ?? "", default_location_id: item.default_location_id ?? "", internal_only: item.internal_only ?? false, tax_category: item.tax_category ?? "labor", costo: item.costo ?? "", recurrencia: item.recurrencia ?? "unica", termino_meses: item.termino_meses ?? "" });
    setEditPhotoFile(null);
    setEditPhotoPreview(item.photo_url ? signedUrls[item.photo_url] ?? null : null);
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop();
    const path = `catalog/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from("Job-photos").upload(path, file);
    if (error) return null;
    return path;
  }

  async function saveEdit(id) {
    setSaving(true);
    const payload = {
      item_code: editForm.item_code.trim(),
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      price: parseFloat(editForm.price) || 0,
      msrp: editForm.msrp !== "" ? parseFloat(editForm.msrp) : null,
      supplier_price: editForm.supplier_price !== "" ? parseFloat(editForm.supplier_price) : null,
      vendor: editForm.vendor.trim() || null,
      internal_only: !!editForm.internal_only,
      // tax_category es independiente de `type` solo para fees — Labor y
      // Producto siguen gravando 1:1 con su propio tipo, igual que hoy.
      tax_category: dataType === "fee" ? (editForm.tax_category || "labor") : dataType,
    };
    if (dataType === "product") {
      payload.stock_quantity = editForm.stock_quantity !== "" ? parseFloat(editForm.stock_quantity) : null;
      payload.default_location_id = editForm.default_location_id || null;
      payload.markup_pct = editForm.markup_pct !== "" ? parseFloat(editForm.markup_pct) : null;
    }
    if (dataType === "fee") {
      payload.costo = editForm.costo !== "" ? parseFloat(editForm.costo) : null;
      payload.recurrencia = editForm.recurrencia || "unica";
      payload.termino_meses = editForm.termino_meses !== "" ? parseInt(editForm.termino_meses, 10) : null;
    }
    if (editPhotoFile) {
      const path = await uploadPhoto(editPhotoFile);
      if (path) payload.photo_url = path;
    }
    const { error } = await supabase.from("catalog_items").update(payload).eq("id", id);
    if (error) {
      alert(t("errorSavingAlert", { message: error.message }));
      setSaving(false);
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...payload } : i));
    setEditingId(null);
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setSaving(false);
  }

  async function deleteItem(id) {
    if (!confirm(t("confirmDeleteItem"))) return;
    await supabase.from("catalog_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function addItem() {
    if (!newItem.item_code.trim() || !newItem.name.trim() || !newItem.description.trim()) {
      alert(t("requiredFieldsAlert"));
      return;
    }
    setSaving(true);
    let photo_url = null;
    if (newPhotoFile) photo_url = await uploadPhoto(newPhotoFile);
    const { data, error } = await supabase.from("catalog_items").insert([{
      type: dataType,
      item_code: newItem.item_code.trim(),
      name: newItem.name.trim(),
      description: newItem.description.trim(),
      price: parseFloat(newItem.price) || 0,
      msrp: newItem.msrp !== "" ? parseFloat(newItem.msrp) : null,
      supplier_price: newItem.supplier_price !== "" ? parseFloat(newItem.supplier_price) : null,
      markup_pct: dataType === "product" && newItem.markup_pct !== "" ? parseFloat(newItem.markup_pct) : null,
      vendor: newItem.vendor.trim() || null,
      stock_quantity: dataType === "product" && newItem.stock_quantity !== "" ? parseFloat(newItem.stock_quantity) : null,
      default_location_id: dataType === "product" ? (newItem.default_location_id || null) : null,
      internal_only: !!newItem.internal_only,
      tax_category: dataType === "fee" ? (newItem.tax_category || "labor") : dataType,
      costo: dataType === "fee" && newItem.costo !== "" ? parseFloat(newItem.costo) : null,
      recurrencia: dataType === "fee" ? (newItem.recurrencia || "unica") : "unica",
      termino_meses: dataType === "fee" && newItem.termino_meses !== "" ? parseInt(newItem.termino_meses, 10) : null,
      photo_url,
    }]).select().single();
    if (error) {
      alert(t("errorSavingAlert", { message: error.message }));
      setSaving(false);
      return;
    }
    if (data) setItems(prev => [...prev, data]);
    setNewItem({ item_code: "", name: "", description: "", price: "", msrp: "", supplier_price: "", markup_pct: "", vendor: "", stock_quantity: "", default_location_id: "", internal_only: false, tax_category: "labor", costo: "", recurrencia: "unica", termino_meses: "" });
    setNewPhotoFile(null);
    setNewPhotoPreview(null);
    setAdding(false);
    setSaving(false);
  }

  function exportCSV() {
    const rows = filtered.map(i => [i.item_code, i.name ?? "", i.description, i.price, i.msrp ?? "", i.supplier_price ?? "", i.markup_pct ?? "", i.vendor ?? "", i.stock_quantity ?? "", i.costo ?? "", i.recurrencia ?? "", i.termino_meses ?? "", i.tax_category ?? "", i.type]);
    const csvContent = [["Item Code", "Nombre", "Descripcion", "Precio", "MSRP", "Costo Suplidor", "Markup %", "Vendor", "Stock", "Costo", "Recurrencia", "Termino Meses", "Categoria Fiscal", "Tipo"], ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${dataType === "labor" ? "Labor" : dataType === "fee" ? "Fees" : "Productos"}_OTESS.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowMenu(false);
  }

  // Parser CSV consciente de comillas: soporta comas y saltos de línea dentro
  // de campos entre comillas (ej. Descripción pegada desde Excel), y comillas
  // escapadas como "". Opera sobre el texto completo, no línea por línea, para
  // que un salto de línea dentro de comillas no corte una fila a la mitad.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur.trim());
        cur = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur.trim());
        cur = "";
        rows.push(row);
        row = [];
      } else {
        cur += ch;
      }
    }
    if (cur !== "" || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows.filter(r => r.some(c => c !== ""));
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    const dataRows = rows[0]?.[0]?.toLowerCase().includes("item code") ? rows.slice(1) : rows;
    const VALID_TYPES = ["labor", "product", "fee"];

    const parsed = dataRows.map(cols => {
      // Columna "Tipo" (índice 13) es opcional — CSVs exportados antes de que
      // existiera caen de vuelta a la pestaña activa, como antes.
      const csvType = (cols[13] || "").toLowerCase().trim();
      const type = VALID_TYPES.includes(csvType) ? csvType : dataType;
      return {
        type, item_code: cols[0] || "", name: cols[1] || "", description: cols[2] || "", price: parseFloat(cols[3]) || 0, msrp: cols[4] ? parseFloat(cols[4]) : null, supplier_price: cols[5] ? parseFloat(cols[5]) : null, markup_pct: type === "product" && cols[6] ? parseFloat(cols[6]) : null, vendor: cols[7] || null, stock_quantity: type === "product" && cols[8] ? parseFloat(cols[8]) : null,
        costo: type === "fee" && cols[9] ? parseFloat(cols[9]) : null,
        recurrencia: type === "fee" && cols[10] ? cols[10] : "unica",
        termino_meses: type === "fee" && cols[11] ? parseInt(cols[11], 10) : null,
        tax_category: type === "fee" ? (cols[12] || "labor") : type,
      };
    }).filter(i => i.item_code && i.name && i.description);

    if (parsed.length === 0) { alert(t("noValidRowsAlert")); return; }

    // Filas con el mismo Item Code dentro del mismo archivo: la última gana,
    // para no mandar dos filas apuntando al mismo id en el upsert de abajo.
    const byCode = new Map();
    for (const i of parsed) byCode.set(i.item_code, i);
    const uniqueRows = [...byCode.values()];

    setSaving(true);

    // Upsert por Item Code: si ya existe un ítem con ese código se actualiza
    // en vez de duplicarlo — re-importar un CSV exportado y editado en Excel
    // es el caso de uso real, no solo cargar un catálogo desde cero.
    const { data: existing, error: lookupError } = await supabase.from("catalog_items").select("id, item_code").in("item_code", uniqueRows.map(i => i.item_code));
    if (lookupError) { setSaving(false); alert(t("errorAlert", { message: lookupError.message })); return; }
    const existingIdByCode = new Map((existing || []).map(r => [r.item_code, r.id]));

    const toUpsert = uniqueRows.map(i => {
      const id = existingIdByCode.get(i.item_code);
      return id ? { ...i, id } : i;
    });
    const updatedCount = toUpsert.filter(i => i.id).length;

    const { data, error } = await supabase.from("catalog_items").upsert(toUpsert).select();
    setSaving(false);
    if (error) { alert(t("errorAlert", { message: error.message })); return; }

    if (data) {
      setItems(prev => {
        const byId = new Map(prev.map(p => [p.id, p]));
        for (const row of data) byId.set(row.id, row);
        return [...byId.values()];
      });
    }
    alert(t("importResultAlert", { newCount: data.length - updatedCount, updatedCount }));
    e.target.value = "";
    setShowMenu(false);
  }

  const fmt = n => n == null ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const vendorOptions = [...new Set(items.map(i => i.vendor).filter(Boolean))];

  return (
    <div>
      <datalist id="vendor-options">
        {vendorOptions.map(v => <option key={v} value={v} />)}
      </datalist>

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("searchPlaceholder", { type: typeMeta[tab].label })}
          style={{ width: "100%", padding: "14px 16px 14px 42px", border: "1.5px solid var(--border)", borderRadius: 12, fontSize: 15, background: "var(--surface)" }} />
      </div>

      {/* Category cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24, maxWidth: 400 }}>
        {Object.entries(typeMeta).map(([key, meta]) => (
          <div key={key} className="hover-lift" onClick={() => setTab(key)}
            style={{
              background: "var(--surface)", borderRadius: 14, padding: "20px 16px", cursor: "pointer", textAlign: "center",
              border: tab === key ? `2.5px solid ${meta.color}` : "2.5px solid transparent",
              boxShadow: tab === key ? `0 4px 16px ${meta.color}33` : "0 1px 4px rgba(0,0,0,0.06)",
            }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{meta.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>{meta.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t("itemsCount", { count: counts[key] })}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>
          {typeMeta[tab].icon} {typeMeta[tab].label} ({filtered.length})
        </p>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          {tab === "fee" && <ViewToggle view={feeView} onChange={setFeeView} />}
          <button className="btn btn-ghost" onClick={() => setShowMenu(m => !m)}>{t("moreButton")}</button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 11, minWidth: 180, overflow: "hidden" }}>
                <button onClick={exportCSV} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>{t("exportCsvButton")}</button>
                <button onClick={() => { fileRef.current?.click(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>{t("importCsvButton")}</button>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          <button className="btn btn-amber" onClick={() => setAdding(true)}>{t("newButton")}</button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: "var(--surface)", border: "1.5px dashed var(--amber)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ cursor: "pointer", flexShrink: 0 }}>
              {newPhotoPreview ? (
                <img src={newPhotoPreview} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--surface-2)", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "var(--muted)" }}>📷</div>
              )}
              <input ref={newPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setNewPhotoFile(f); setNewPhotoPreview(URL.createObjectURL(f)); }
              }} />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newItem.item_code} onChange={e => setNewItem(f => ({ ...f, item_code: e.target.value }))} placeholder={t("itemCodePlaceholder")} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace", width: 140, flexShrink: 0 }} />
                <input value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} maxLength={150} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0 }} />
              </div>
              <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} maxLength={200} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, width: "100%" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {dataType === "product" && (
                  <input type="number" value={newItem.msrp} onChange={e => setNewItem(f => ({ ...f, msrp: e.target.value }))} placeholder={t("msrpPlaceholder")} step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--muted)", width: 90 }} />
                )}
                <input type="number" value={newItem.price} onChange={e => setNewItem(f => ({ ...f, price: e.target.value }))} placeholder={t("pricePlaceholder")} step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700, width: 100 }} title={t("priceTitle")} />
                {dataType === "product" && (
                  <input type="number" value={newItem.supplier_price} onChange={e => applyMarkup(setNewItem, { supplier_price: e.target.value })} placeholder={t("costPlaceholder")} step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--warn)", width: 90 }} />
                )}
                {dataType === "product" && (
                  <input type="number" value={newItem.markup_pct} onChange={e => applyMarkup(setNewItem, { markup_pct: e.target.value })} placeholder={t("markupPlaceholder")} step="1" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 90 }} title={t("markupTitle")} />
                )}
                {dataType === "product" && (
                  <input list="vendor-options" value={newItem.vendor} onChange={e => setNewItem(f => ({ ...f, vendor: e.target.value }))} placeholder={t("vendorPlaceholder")} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 120 }} />
                )}
                {dataType === "product" && (
                  <input type="number" value={newItem.stock_quantity} onChange={e => setNewItem(f => ({ ...f, stock_quantity: e.target.value }))} placeholder={t("stockPlaceholder")} step="1" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--navy)", width: 80 }} title={t("stockTitle")} />
                )}
                {dataType === "product" && (
                  <select value={newItem.default_location_id} onChange={e => setNewItem(f => ({ ...f, default_location_id: e.target.value }))} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 160 }} title={t("locationTitle")}>
                    <option value="">{t("noLocationOption")}</option>
                    {flatLocationOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                )}
                {dataType === "fee" && (
                  <input type="number" value={newItem.costo} onChange={e => setNewItem(f => ({ ...f, costo: e.target.value }))} placeholder={t("feeCostPlaceholder")} step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--warn)", width: 150 }} />
                )}
                {dataType === "fee" && (
                  <select value={newItem.tax_category} onChange={e => setNewItem(f => ({ ...f, tax_category: e.target.value }))} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 200 }} title={t("taxCategoryTitle")}>
                    {Object.entries(taxCategoryMeta).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                )}
                {dataType === "fee" && (
                  <select value={newItem.recurrencia} onChange={e => setNewItem(f => ({ ...f, recurrencia: e.target.value }))} style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 110 }}>
                    {Object.entries(recurrenciaLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
                {dataType === "fee" && newItem.recurrencia !== "unica" && (
                  <input type="number" value={newItem.termino_meses} onChange={e => setNewItem(f => ({ ...f, termino_meses: e.target.value }))} placeholder={t("termMonthsPlaceholder")} step="1" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 130 }} title={t("termMonthsTitle")} />
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }} title={t("internalOnlyTitle")}>
                <input type="checkbox" checked={newItem.internal_only} onChange={e => setNewItem(f => ({ ...f, internal_only: e.target.checked }))} />
                {t("internalOnlyLabel")}
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setAdding(false); setNewPhotoFile(null); setNewPhotoPreview(null); }} className="btn btn-ghost">{t("cancelButton")}</button>
            <button onClick={addItem} disabled={saving} className="btn btn-primary">{saving ? t("savingButton") : t("saveItemButton")}</button>
          </div>
        </div>
      )}

      {/* List of items (filas horizontales estilo Portal.io) */}
      {tab === "fee" ? (
        <CatalogoView
          items={filtered}
          view={feeView}
          emptyLabel={t("emptyFees")}
          columns={[
            { key: "item_code", label: t("columnCode"), render: item => editingId === item.id
              ? <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace", width: 100 }} />
              : <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--amber)" }}>{item.item_code}</span> },
            { key: "desc", label: t("columnDescription"), render: item => editingId === item.id
              ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t("nameShortPlaceholder")} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontWeight: 700 }} />
                  <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                </div>
              : <div>
                  <div style={{ fontWeight: 700 }}>{item.name || item.description}{item.internal_only && <span style={{ marginLeft: 6, color: "var(--muted)" }} title={t("internalOnlyBadgeTitle")}>🔒</span>}</div>
                  {item.name && item.description && <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.description}</div>}
                </div> },
            { key: "costo", label: t("columnCost"), render: item => editingId === item.id
              ? <input type="number" value={editForm.costo} onChange={e => setEditForm(f => ({ ...f, costo: e.target.value }))} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 90 }} />
              : (item.costo != null ? fmt(item.costo) : "—") },
            { key: "price", label: t("columnPrice"), render: item => editingId === item.id
              ? <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 12, fontWeight: 700, width: 90 }} />
              : <span style={{ fontWeight: 800, color: "var(--navy)" }}>{fmt(item.price)}</span> },
            { key: "recurrencia", label: t("columnRecurrence"), render: item => editingId === item.id
              ? <div style={{ display: "flex", gap: 4 }}>
                  <select value={editForm.recurrencia} onChange={e => setEditForm(f => ({ ...f, recurrencia: e.target.value }))} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                    {Object.entries(recurrenciaLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {editForm.recurrencia !== "unica" && (
                    <input type="number" value={editForm.termino_meses} onChange={e => setEditForm(f => ({ ...f, termino_meses: e.target.value }))} placeholder={t("monthsPlaceholder")} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 70 }} />
                  )}
                </div>
              : `${recurrenciaLabels[item.recurrencia] ?? recurrenciaLabels.unica}${item.termino_meses ? ` · ${item.termino_meses}m` : ""}` },
            { key: "tax_category", label: t("columnTaxRate"), render: item => editingId === item.id
              ? <select value={editForm.tax_category} onChange={e => setEditForm(f => ({ ...f, tax_category: e.target.value }))} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                  {Object.entries(taxCategoryMeta).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              : <span style={{ fontSize: 12 }}>{taxCategoryMeta[item.tax_category]?.label ?? item.tax_category}</span> },
            { key: "actions", label: "", render: item => editingId === item.id
              ? <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}>💾</button>
                  <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>✕</button>
                </div>
              : <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>✏️</button>
                  <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--warn)" }}>🗑</button>
                </div> },
          ]}
          renderTile={item => editingId === item.id ? (
            <div key={item.id} style={{ background: "var(--surface)", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t("nameShortPlaceholder")} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
              <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" value={editForm.costo} onChange={e => setEditForm(f => ({ ...f, costo: e.target.value }))} placeholder={t("costPlaceholder")} step="0.01" style={{ padding: "6px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: "50%" }} />
                <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder={t("priceShortPlaceholder")} step="0.01" style={{ padding: "6px 8px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 12, fontWeight: 700, width: "50%" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={editForm.recurrencia} onChange={e => setEditForm(f => ({ ...f, recurrencia: e.target.value }))} style={{ padding: "6px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, flex: 1 }}>
                  {Object.entries(recurrenciaLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {editForm.recurrencia !== "unica" && (
                  <input type="number" value={editForm.termino_meses} onChange={e => setEditForm(f => ({ ...f, termino_meses: e.target.value }))} placeholder={t("monthsPlaceholder")} style={{ padding: "6px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 70 }} />
                )}
              </div>
              <select value={editForm.tax_category} onChange={e => setEditForm(f => ({ ...f, tax_category: e.target.value }))} style={{ padding: "6px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                {Object.entries(taxCategoryMeta).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "6px 10px", flex: 1, justifyContent: "center" }}>{t("saveButton")}</button>
                <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }}>✕</button>
              </div>
            </div>
          ) : (
            <div key={item.id} style={{ background: "var(--surface)", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{item.item_code}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name || item.description}</div>
              {item.name && item.description && <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.description}</div>}
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>{fmt(item.price)}</div>
              {item.costo != null && <div style={{ fontSize: 11, color: "var(--warn)" }}>{t("columnCost")}: {fmt(item.costo)}</div>}
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{recurrenciaLabels[item.recurrencia] ?? recurrenciaLabels.unica}{item.termino_meses ? ` · ${item.termino_meses}m` : ""}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{taxCategoryMeta[item.tax_category]?.label ?? item.tax_category}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", flex: 1, justifyContent: "center" }}>{t("editButton")}</button>
                <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
              </div>
            </div>
          )}
        />
      ) : filtered.length === 0 ? (
        <div className="empty"><p>{dataType === "labor" ? t("emptyItemsLabor") : t("emptyItemsProduct")}</p></div>
      ) : isCardView ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(item => {
            const margin = item.price > 0 && item.supplier_price != null
              ? Math.round(((item.price - item.supplier_price) / item.price) * 100) : null;
            return (
              <div key={item.id} style={{ background: "var(--surface)", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
                {editingId === item.id ? (
                  <>
                    <label style={{ cursor: "pointer", alignSelf: "center" }}>
                      {editPhotoPreview ? (
                        <img src={editPhotoPreview} style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8, background: "var(--surface-2)" }} />
                      ) : (
                        <div style={{ width: 80, height: 80, borderRadius: 8, background: "var(--surface-2)", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "var(--muted)" }}>📷</div>
                      )}
                      <input ref={editPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setEditPhotoFile(f); setEditPhotoPreview(URL.createObjectURL(f)); }
                      }} />
                    </label>
                    <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} placeholder={t("itemCodePlaceholder")} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }} />
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} maxLength={150} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
                    <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} maxLength={200} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
                    {item.type === "product" && (
                      <input type="number" value={editForm.msrp} onChange={e => setEditForm(f => ({ ...f, msrp: e.target.value }))} placeholder={t("msrpPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }} />
                    )}
                    <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder={t("priceShortPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} title={t("priceTitle")} />
                    {item.type === "product" && (
                      <input type="number" value={editForm.supplier_price} onChange={e => applyMarkup(setEditForm, { supplier_price: e.target.value })} placeholder={t("costPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--warn)" }} />
                    )}
                    {item.type === "product" && (
                      <input type="number" value={editForm.markup_pct} onChange={e => applyMarkup(setEditForm, { markup_pct: e.target.value })} placeholder={t("markupPlaceholder")} step="1" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11 }} title={t("markupTitle")} />
                    )}
                    {item.type === "product" && (
                      <input list="vendor-options" value={editForm.vendor} onChange={e => setEditForm(f => ({ ...f, vendor: e.target.value }))} placeholder={t("vendorPlaceholder")} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11 }} />
                    )}
                    {item.type === "product" && (
                      <input type="number" value={editForm.stock_quantity} onChange={e => setEditForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder={t("stockPlaceholder")} step="1" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--navy)" }} title={t("stockTitle")} />
                    )}
                    {item.type === "product" && (
                      <select value={editForm.default_location_id} onChange={e => setEditForm(f => ({ ...f, default_location_id: e.target.value }))} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11 }} title={t("locationTitle")}>
                        <option value="">{t("noLocationOption")}</option>
                        {flatLocationOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", cursor: "pointer" }} title={t("internalOnlyTitle")}>
                      <input type="checkbox" checked={!!editForm.internal_only} onChange={e => setEditForm(f => ({ ...f, internal_only: e.target.checked }))} />
                      {t("internalOnlyShortLabel")}
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px", flex: 1, justifyContent: "center" }}>{t("saveButton")}</button>
                      <button onClick={() => { setEditingId(null); setEditPhotoFile(null); setEditPhotoPreview(null); }} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>✕</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: "100%", height: 110, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, overflow: "hidden" }}>
                      {item.photo_url && signedUrls[item.photo_url] ? (
                        <img src={signedUrls[item.photo_url]} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : "📦"}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{item.item_code}{item.internal_only && <span style={{ marginLeft: 6, color: "var(--muted)" }} title={t("internalOnlyBadgeTitle")}>{t("internalOnlyBadge")}</span>}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name || item.description}</div>
                    {item.name && item.description && <div style={{ fontSize: 12, color: "var(--muted)", minHeight: 34 }}>{item.description}</div>}
                    <div>
                      {item.type === "product" && item.msrp != null && <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>{t("msrpLabel", { value: fmt(item.msrp) })}</div>}
                      <div style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>{fmt(item.price)}</div>
                      {item.type === "product" && item.supplier_price != null && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--warn)" }}>
                          <span>{t("columnCost")}: {fmt(item.supplier_price)}</span>
                          {margin != null && <span title={t("marginTitle")} style={{ color: margin >= 0 ? "var(--ok)" : "var(--warn)", fontWeight: 700 }}>{t("marginLabel", { margin })}</span>}
                        </div>
                      )}
                      {item.type === "product" && item.markup_pct != null && (
                        <div style={{ fontSize: 11, color: "var(--muted)" }} title={t("markupUsedTitle")}>{t("markupLabel", { pct: item.markup_pct })}</div>
                      )}
                      {item.type === "product" && item.vendor && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>🏪 {item.vendor}</div>}
                      {item.type === "product" && item.stock_quantity != null && (
                        <div style={{ fontSize: 11, color: item.stock_quantity <= 0 ? "var(--warn)" : "var(--navy)", fontWeight: 700, marginTop: 2 }}>{t("stockLabel", { qty: item.stock_quantity })}</div>
                      )}
                      {item.type === "product" && locationBreakdown(item.id).length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                          {locationBreakdown(item.id).map(s => `${LOCATION_ICONS[locationsById[s.location_id]?.type] ?? "📍"} ${locationsById[s.location_id]?.name ?? "?"}: ${s.quantity}`).join(" · ")}
                        </div>
                      )}
                      {item.type === "product" && reelsForItem(item.id).length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                          {t("reelsSummary", { count: reelsForItem(item.id).length, feet: reelsForItem(item.id).reduce((a, r) => a + r.remaining_footage, 0) })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", flex: 1, justifyContent: "center" }}>{t("editButton")}</button>
                      {item.type === "product" && (
                        <button onClick={() => openReelsModal(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} title={t("reelsButtonTitle")}>🧵</button>
                      )}
                      <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          {filtered.map((item, idx) => (
            <div key={item.id} style={{ padding: "14px 18px", borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
              {editingId === item.id ? (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <label style={{ cursor: "pointer", flexShrink: 0 }}>
                    {editPhotoPreview ? (
                      <img src={editPhotoPreview} style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, background: "var(--surface-2)" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--surface-2)", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "var(--muted)" }}>📷</div>
                    )}
                    <input ref={editPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setEditPhotoFile(f); setEditPhotoPreview(URL.createObjectURL(f)); }
                    }} />
                  </label>
                  <div style={{ flex: 1, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} placeholder={t("itemCodePlaceholder")} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace", width: 140 }} />
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} maxLength={150} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontWeight: 700, flex: 1 }} />
                    </div>
                    <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} maxLength={200} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, width: "100%" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", cursor: "pointer" }} title={t("internalOnlyTitle")}>
                      <input type="checkbox" checked={!!editForm.internal_only} onChange={e => setEditForm(f => ({ ...f, internal_only: e.target.checked }))} />
                      {t("internalOnlyLabel")}
                    </label>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>{t("saveButton")}</button>
                      <button onClick={() => { setEditingId(null); setEditPhotoFile(null); setEditPhotoPreview(null); }} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>{t("cancelWithIconButton")}</button>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, width: 100 }}>
                    {item.type === "product" && (
                      <input type="number" value={editForm.msrp} onChange={e => setEditForm(f => ({ ...f, msrp: e.target.value }))} placeholder={t("msrpPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--muted)", textAlign: "right", width: "100%", marginBottom: 3 }} />
                    )}
                    <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder={t("priceShortPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700, textAlign: "right", width: "100%", marginBottom: 3 }} title={t("priceTitle")} />
                    {item.type === "product" && (
                      <input type="number" value={editForm.supplier_price} onChange={e => applyMarkup(setEditForm, { supplier_price: e.target.value })} placeholder={t("costPlaceholder")} step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--warn)", textAlign: "right", width: "100%", marginBottom: 3 }} />
                    )}
                    {item.type === "product" && (
                      <input type="number" value={editForm.markup_pct} onChange={e => applyMarkup(setEditForm, { markup_pct: e.target.value })} placeholder={t("markupPlaceholder")} step="1" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, textAlign: "right", width: "100%" }} title={t("markupTitle")} />
                    )}
                    {item.type === "product" && (
                      <input list="vendor-options" value={editForm.vendor} onChange={e => setEditForm(f => ({ ...f, vendor: e.target.value }))} placeholder={t("vendorPlaceholder")} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, textAlign: "right", width: "100%" }} />
                    )}
                    {item.type === "product" && (
                      <input type="number" value={editForm.stock_quantity} onChange={e => setEditForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder={t("stockPlaceholder")} step="1" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--navy)", textAlign: "right", width: "100%", marginTop: 3 }} title={t("stockTitle")} />
                    )}
                    {item.type === "product" && (
                      <select value={editForm.default_location_id} onChange={e => setEditForm(f => ({ ...f, default_location_id: e.target.value }))} style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, width: "100%", marginTop: 3 }} title={t("locationTitle")}>
                        <option value="">{t("noLocationOption")}</option>
                        {flatLocationOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, overflow: "hidden" }}>
                    {item.photo_url && signedUrls[item.photo_url] ? (
                      <img src={signedUrls[item.photo_url]} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      typeMeta[item.type]?.icon ?? "📦"
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{item.item_code}{item.internal_only && <span style={{ marginLeft: 6, color: "var(--muted)" }} title={t("internalOnlyBadgeTitle")}>{t("internalOnlyBadge")}</span>}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name || item.description}</div>
                    {item.name && item.description && <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.description}</div>}
                    {item.type === "product" && item.vendor && <div style={{ fontSize: 11, color: "var(--muted)" }}>🏪 {item.vendor}</div>}
                    {item.type === "product" && item.stock_quantity != null && (
                      <div style={{ fontSize: 11, color: item.stock_quantity <= 0 ? "var(--warn)" : "var(--navy)", fontWeight: 700 }}>{t("stockLabel", { qty: item.stock_quantity })}</div>
                    )}
                    {item.type === "product" && locationBreakdown(item.id).length > 0 && (
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        {locationBreakdown(item.id).map(s => `${LOCATION_ICONS[locationsById[s.location_id]?.type] ?? "📍"} ${locationsById[s.location_id]?.name ?? "?"}: ${s.quantity}`).join(" · ")}
                      </div>
                    )}
                    {item.type === "product" && reelsForItem(item.id).length > 0 && (
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        {t("reelsSummary", { count: reelsForItem(item.id).length, feet: reelsForItem(item.id).reduce((a, r) => a + r.remaining_footage, 0) })}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, width: 110 }}>
                    {item.type === "product" && item.msrp != null && <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>{t("msrpLabel", { value: fmt(item.msrp) })}</div>}
                    <div style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>{fmt(item.price)}</div>
                    {item.type === "product" && item.supplier_price != null && <div style={{ fontSize: 11, color: "var(--warn)" }}>{t("columnCost")}: {fmt(item.supplier_price)}</div>}
                    {item.type === "product" && item.markup_pct != null && <div style={{ fontSize: 11, color: "var(--muted)" }} title={t("markupUsedTitle")}>{t("markupLabel", { pct: item.markup_pct })}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>{t("editButton")}</button>
                    {item.type === "product" && (
                      <button onClick={() => openReelsModal(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} title={t("reelsButtonTitle")}>🧵</button>
                    )}
                    <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {reelsModalItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setReelsModalItem(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{t("reelsModalTitle", { name: reelsModalItem.name || reelsModalItem.description })}</div>
              <button onClick={() => setReelsModalItem(null)} aria-label={t("closeAriaLabel")} style={{ background: "var(--surface-2)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>

            <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("addReelSectionTitle")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={newReel.location_id} onChange={e => setNewReel(f => ({ ...f, location_id: e.target.value }))}
                  style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, flex: "1 1 160px" }}>
                  <option value="">{t("locationSelectPlaceholder")}</option>
                  {flatLocationOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <input value={newReel.code} onChange={e => setNewReel(f => ({ ...f, code: e.target.value }))} placeholder={t("reelCodePlaceholder")}
                  style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 130 }} />
                <input type="number" value={newReel.total_footage} onChange={e => setNewReel(f => ({ ...f, total_footage: e.target.value }))} placeholder={t("totalFootagePlaceholder")}
                  style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, width: 100 }} />
                <button onClick={addReel} disabled={savingReel || !newReel.location_id || !newReel.total_footage} className="btn btn-primary" style={{ fontSize: 12, padding: "8px 14px" }}>
                  {savingReel ? t("savingButton") : t("addButton")}
                </button>
              </div>
            </div>

            {reelError && <p style={{ color: "var(--warn)", fontSize: 12, marginBottom: 10 }}>{reelError}</p>}

            {reelsForItem(reelsModalItem.id).length === 0 ? (
              <div className="empty"><p>{t("emptyReels")}</p></div>
            ) : (
              reelsForItem(reelsModalItem.id).map(reel => {
                const pct = reel.total_footage > 0 ? Math.max(0, Math.min(100, (reel.remaining_footage / reel.total_footage) * 100)) : 0;
                return (
                  <div key={reel.id} style={{ border: "1.5px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {LOCATION_ICONS[locationsById[reel.location_id]?.type] ?? "📍"} {locationsById[reel.location_id]?.name ?? "?"}
                        {reel.code && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {reel.code}</span>}
                      </div>
                      <button onClick={() => deleteReel(reel)} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "var(--warn)" }}>🗑</button>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("feetRemaining", { remaining: reel.remaining_footage, total: reel.total_footage })}</div>
                    <div style={{ background: "var(--surface-2)", borderRadius: 20, height: 6, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ background: pct <= 15 ? "var(--warn)" : "var(--amber)", height: "100%", width: `${pct}%` }} />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" value={reelFootageInputs[reel.id] ?? ""} onChange={e => setReelFootageInputs(prev => ({ ...prev, [reel.id]: e.target.value }))} placeholder={t("footageUsedPlaceholder")}
                        style={{ flex: 1, padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                      <button onClick={() => useReelFootage(reel)} disabled={savingReel || !reelFootageInputs[reel.id]} className="btn btn-amber" style={{ fontSize: 12, padding: "6px 12px" }}>{t("useButton")}</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
