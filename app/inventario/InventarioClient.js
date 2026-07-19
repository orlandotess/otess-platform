"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import BarcodeScanner from "../BarcodeScanner";

const TYPE_META = {
  warehouse: { label: "Almacén", icon: "🏢" },
  site: { label: "Sitio", icon: "📍" },
  van: { label: "Van", icon: "🚐" },
  zone: { label: "Zona", icon: "🗂️" },
  shelf: { label: "Estante", icon: "📚" },
  bin: { label: "Bin", icon: "🗃️" },
};

export default function InventarioClient({ locations: initialLocations, locationStock: initialStock, products, locationStockUnits: initialUnits }) {
  const [locations, setLocations] = useState(initialLocations);
  const [stock, setStock] = useState(initialStock);
  const [units, setUnits] = useState(initialUnits ?? []);
  const [view, setView] = useState("tree");
  const [selectedId, setSelectedId] = useState(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitError, setUnitError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showUnitScanner, setShowUnitScanner] = useState(false);

  const [addForm, setAddForm] = useState({ name: "", type: "warehouse", code: "", parent_id: "" });
  const [bulkForm, setBulkForm] = useState({ prefix: "Estante", type: "shelf", parent_id: "", start: 1, end: 5, codePrefix: "" });
  const [adjustForm, setAdjustForm] = useState({ catalog_item_id: "", delta: "", reason: "" });
  const [transferForm, setTransferForm] = useState({ catalog_item_id: "", to_location_id: "", quantity: "", reason: "" });
  const [unitForm, setUnitForm] = useState({ catalog_item_id: "", serial_number: "", notes: "" });
  const [unitPhotoFile, setUnitPhotoFile] = useState(null);
  const [unitPhotoPreview, setUnitPhotoPreview] = useState(null);

  // Resuelve las URLs firmadas de las fotos una sola vez al montar (misma bucket privado Job-photos que usa Crew App).
  useEffect(() => {
    if (!initialUnits?.some(u => u.photo_path)) return;
    (async () => {
      const withUrls = await Promise.all(initialUnits.map(async u => ({
        ...u,
        photo_signed_url: u.photo_path ? (await supabase.storage.from("Job-photos").createSignedUrl(u.photo_path, 3600)).data?.signedUrl ?? null : null,
      })));
      setUnits(withUrls);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleLocations = showInactive ? locations : locations.filter(l => l.is_active);

  const childrenOf = useMemo(() => {
    const map = {};
    for (const l of visibleLocations) {
      const key = l.parent_id ?? "__root__";
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    return map;
  }, [visibleLocations]);

  const byId = useMemo(() => {
    const map = {};
    for (const l of locations) map[l.id] = l;
    return map;
  }, [locations]);

  function pathTo(id) {
    const parts = [];
    let cur = byId[id];
    while (cur) {
      parts.unshift(cur);
      cur = cur.parent_id ? byId[cur.parent_id] : null;
    }
    return parts;
  }

  // Lista plana e indentada de ubicaciones, para selects de padre/destino.
  const flatOptions = useMemo(() => {
    const out = [];
    function walk(parentKey, depth) {
      for (const l of [...(childrenOf[parentKey] ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ id: l.id, label: `${"—".repeat(depth)} ${TYPE_META[l.type]?.icon ?? ""} ${l.name}`.trim() });
        walk(l.id, depth + 1);
      }
    }
    walk("__root__", 0);
    return out;
  }, [childrenOf]);

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const selected = selectedId ? byId[selectedId] : null;
  const selectedChildren = selectedId ? (childrenOf[selectedId] ?? []) : [];
  const selectedStock = selectedId ? stock.filter(s => s.location_id === selectedId) : [];
  const unitSearchTerm = unitSearch.trim().toLowerCase();
  const selectedUnits = selectedId ? units.filter(u => u.location_id === selectedId
    && (!unitSearchTerm || u.serial_number.toLowerCase().includes(unitSearchTerm) || u.catalog_items?.description?.toLowerCase().includes(unitSearchTerm) || u.catalog_items?.item_code?.toLowerCase().includes(unitSearchTerm))) : [];

  function closeAddUnitModal() {
    setShowAddUnitModal(false);
    setUnitForm({ catalog_item_id: "", serial_number: "", notes: "" });
    setUnitPhotoFile(null);
    setUnitPhotoPreview(null);
    setUnitError("");
  }

  async function addUnit() {
    if (!unitForm.catalog_item_id || !unitForm.serial_number.trim() || !selectedId) return;
    setSavingUnit(true);
    setUnitError("");
    let photo_path = null;
    if (unitPhotoFile) {
      const ext = unitPhotoFile.name.split(".").pop();
      photo_path = `inventory/${unitForm.catalog_item_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("Job-photos").upload(photo_path, unitPhotoFile);
      if (upErr) { setSavingUnit(false); setUnitError("No se pudo subir la foto. Intenta de nuevo."); return; }
    }
    const { data, error } = await supabase.from("location_stock_units").insert([{
      location_id: selectedId,
      catalog_item_id: unitForm.catalog_item_id,
      serial_number: unitForm.serial_number.trim(),
      photo_path,
      notes: unitForm.notes.trim() || null,
    }]).select("*, catalog_items(item_code, description)").single();
    setSavingUnit(false);
    if (error) {
      setUnitError(error.code === "23505" ? "Ese serial number ya existe en el sistema." : "Error: " + error.message);
      return;
    }
    const photo_signed_url = photo_path ? (await supabase.storage.from("Job-photos").createSignedUrl(photo_path, 3600)).data?.signedUrl ?? null : null;
    setUnits(prev => [{ ...data, photo_signed_url }, ...prev]);
    closeAddUnitModal();
  }

  async function deleteUnit(unit) {
    if (!confirm(`¿Eliminar el equipo con serial "${unit.serial_number}"? Esto no se puede deshacer.`)) return;
    await supabase.from("location_stock_units").delete().eq("id", unit.id);
    setUnits(prev => prev.filter(u => u.id !== unit.id));
  }

  async function addLocation() {
    if (!addForm.name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("locations").insert([{
      name: addForm.name.trim(),
      type: addForm.type,
      code: addForm.code.trim() || null,
      parent_id: addForm.parent_id || null,
    }]).select().single();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setLocations(prev => [...prev, data]);
    setShowAddModal(false);
    if (data.parent_id) setExpanded(prev => ({ ...prev, [data.parent_id]: true }));
    setAddForm({ name: "", type: "warehouse", code: "", parent_id: "" });
    setSelectedId(data.id);
  }

  async function bulkCreate() {
    const start = parseInt(bulkForm.start), end = parseInt(bulkForm.end);
    if (!bulkForm.prefix.trim() || isNaN(start) || isNaN(end) || end < start) return;
    const rows = [];
    for (let i = start; i <= end; i++) {
      rows.push({
        name: `${bulkForm.prefix.trim()} ${i}`,
        type: bulkForm.type,
        code: bulkForm.codePrefix.trim() ? `${bulkForm.codePrefix.trim()}-${i}` : null,
        parent_id: bulkForm.parent_id || null,
      });
    }
    setSaving(true);
    const { data, error } = await supabase.from("locations").insert(rows).select();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setLocations(prev => [...prev, ...data]);
    setShowBulkModal(false);
    if (bulkForm.parent_id) setExpanded(prev => ({ ...prev, [bulkForm.parent_id]: true }));
    setBulkForm({ prefix: "Estante", type: "shelf", parent_id: "", start: 1, end: 5, codePrefix: "" });
  }

  async function renameLocation(loc) {
    const newName = prompt(`Renombrar "${loc.name}":`, loc.name);
    if (!newName || newName.trim() === loc.name) return;
    await supabase.from("locations").update({ name: newName.trim() }).eq("id", loc.id);
    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, name: newName.trim() } : l));
  }

  async function toggleActive(loc) {
    const is_active = !loc.is_active;
    await supabase.from("locations").update({ is_active }).eq("id", loc.id);
    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_active } : l));
  }

  async function deleteLocation(loc) {
    if (!confirm(`¿Eliminar "${loc.name}"? Esto no se puede deshacer.`)) return;
    const { error } = await supabase.from("locations").delete().eq("id", loc.id);
    if (error) {
      alert("No se puede eliminar: tiene sub-ubicaciones o stock asignado. Muévelos primero, o archívala con el botón de abajo.");
      return;
    }
    setLocations(prev => prev.filter(l => l.id !== loc.id));
    if (selectedId === loc.id) setSelectedId(null);
  }

  async function adjustStock() {
    const delta = parseFloat(adjustForm.delta);
    if (!adjustForm.catalog_item_id || !delta || !selectedId) return;
    setSaving(true);
    const { error } = await supabase.rpc("adjust_catalog_stock", {
      p_catalog_item_id: adjustForm.catalog_item_id,
      p_delta: delta,
      p_invoice_id: null,
      p_reason: adjustForm.reason.trim() || "manual_adjustment",
      p_location_id: selectedId,
    });
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setStock(prev => {
      const idx = prev.findIndex(s => s.location_id === selectedId && s.catalog_item_id === adjustForm.catalog_item_id);
      if (idx === -1) {
        const prod = products.find(p => p.id === adjustForm.catalog_item_id);
        return [...prev, { id: `tmp-${Date.now()}`, location_id: selectedId, catalog_item_id: adjustForm.catalog_item_id, quantity: delta, catalog_items: prod ? { item_code: prod.item_code, description: prod.description } : null }];
      }
      return prev.map((s, i) => i === idx ? { ...s, quantity: s.quantity + delta } : s);
    });
    setShowAdjustModal(false);
    setAdjustForm({ catalog_item_id: "", delta: "", reason: "" });
  }

  async function transferStock() {
    const quantity = parseFloat(transferForm.quantity);
    if (!transferForm.catalog_item_id || !transferForm.to_location_id || !quantity || !selectedId) return;
    if (transferForm.to_location_id === selectedId) { alert("Elige una ubicación destino distinta."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("transfer_stock", {
      p_catalog_item_id: transferForm.catalog_item_id,
      p_from_location_id: selectedId,
      p_to_location_id: transferForm.to_location_id,
      p_quantity: quantity,
      p_reason: transferForm.reason.trim() || "manual_transfer",
    });
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setStock(prev => {
      let next = prev.map(s => s.location_id === selectedId && s.catalog_item_id === transferForm.catalog_item_id
        ? { ...s, quantity: s.quantity - quantity } : s);
      const toIdx = next.findIndex(s => s.location_id === transferForm.to_location_id && s.catalog_item_id === transferForm.catalog_item_id);
      if (toIdx === -1) {
        const prod = products.find(p => p.id === transferForm.catalog_item_id);
        next = [...next, { id: `tmp-${Date.now()}`, location_id: transferForm.to_location_id, catalog_item_id: transferForm.catalog_item_id, quantity, catalog_items: prod ? { item_code: prod.item_code, description: prod.description } : null }];
      } else {
        next = next.map((s, i) => i === toIdx ? { ...s, quantity: s.quantity + quantity } : s);
      }
      return next;
    });
    setShowTransferModal(false);
    setTransferForm({ catalog_item_id: "", to_location_id: "", quantity: "", reason: "" });
  }

  async function openHistory() {
    setShowHistory(true);
    setLoadingHistory(true);
    const { data } = await supabase.from("inventory_transactions")
      .select("*, catalog_items(item_code, description)")
      .eq("location_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory(data ?? []);
    setLoadingHistory(false);
  }

  function LocationNode({ loc, depth }) {
    const kids = childrenOf[loc.id] ?? [];
    const isOpen = expanded[loc.id];
    return (
      <div>
        <div
          onClick={() => setSelectedId(loc.id)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", paddingLeft: 10 + depth * 18,
            cursor: "pointer", borderRadius: 8, background: selectedId === loc.id ? "var(--surface-2)" : "transparent",
            opacity: loc.is_active ? 1 : 0.5,
          }}
        >
          {kids.length > 0 ? (
            <span onClick={e => { e.stopPropagation(); toggleExpand(loc.id); }} style={{ width: 14, fontSize: 11, color: "var(--muted)" }}>{isOpen ? "▼" : "▶"}</span>
          ) : <span style={{ width: 14 }} />}
          <span>{TYPE_META[loc.type]?.icon}</span>
          <span style={{ fontWeight: selectedId === loc.id ? 700 : 500, fontSize: 13 }}>{loc.name}</span>
          {loc.code && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{loc.code}</span>}
          {!loc.is_active && <span style={{ fontSize: 10, color: "var(--warn)" }}>(inactiva)</span>}
        </div>
        {isOpen && kids.sort((a, b) => a.name.localeCompare(b.name)).map(k => <LocationNode key={k.id} loc={k} depth={depth + 1} />)}
      </div>
    );
  }

  const roots = [...(childrenOf["__root__"] ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const tableRows = [...visibleLocations].sort((a, b) => a.name.localeCompare(b.name));
  const locationQueryTerm = locationQuery.trim().toLowerCase();
  const filteredTableRows = locationQueryTerm
    ? tableRows.filter(l => l.name.toLowerCase().includes(locationQueryTerm) || l.code?.toLowerCase().includes(locationQueryTerm))
    : tableRows;

  function LocationRow({ l }) {
    const path = pathTo(l.id);
    return (
      <div onClick={() => setSelectedId(l.id)}
        style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: selectedId === l.id ? "var(--surface-2)" : "transparent", opacity: l.is_active ? 1 : 0.5 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{TYPE_META[l.type]?.icon} {l.name} {l.code && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{l.code}</span>}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{path.map(p => p.name).join(" › ")}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", borderRadius: 10, padding: 4 }}>
          <button onClick={() => setView("tree")} className="btn" style={{ background: view === "tree" ? "var(--surface)" : "none", boxShadow: view === "tree" ? "0 1px 4px rgba(0,0,0,0.1)" : "none", border: "none", fontWeight: 700, fontSize: 13 }}>🌳 Árbol</button>
          <button onClick={() => setView("table")} className="btn" style={{ background: view === "table" ? "var(--surface)" : "none", boxShadow: view === "table" ? "0 1px 4px rgba(0,0,0,0.1)" : "none", border: "none", fontWeight: 700, fontSize: 13 }}>📋 Tabla</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Mostrar inactivas
          </label>
          <button className="btn btn-ghost" onClick={() => setShowBulkModal(true)}>📑 Bulk Create</button>
          <button className="btn btn-amber" onClick={() => setShowAddModal(true)}>+ Nueva Ubicación</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 380px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Jerarquía */}
        <div style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--navy)", padding: "6px 10px 10px" }}>Jerarquía de Ubicaciones</div>
          <input
            value={locationQuery}
            onChange={e => setLocationQuery(e.target.value)}
            placeholder="🔍 Buscar ubicación..."
            style={{ width: "100%", padding: "8px 10px", marginBottom: 8, border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}
          />
          {roots.length === 0 ? (
            <div className="empty"><p>Sin ubicaciones aún. Crea la primera con "+ Nueva Ubicación".</p></div>
          ) : locationQueryTerm ? (
            filteredTableRows.length === 0 ? (
              <div className="empty"><p>Sin resultados.</p></div>
            ) : (
              <div>{filteredTableRows.map(l => <LocationRow key={l.id} l={l} />)}</div>
            )
          ) : view === "tree" ? (
            roots.map(l => <LocationNode key={l.id} loc={l} depth={0} />)
          ) : (
            <div>
              {tableRows.map(l => <LocationRow key={l.id} l={l} />)}
            </div>
          )}
        </div>

        {/* Detalle */}
        <div style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20, minHeight: 300 }}>
          {!selected ? (
            <div className="empty" style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📍</div>
              <p>Selecciona una ubicación del árbol para ver sus detalles.</p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{pathTo(selected.id).map(p => p.name).join(" › ")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{TYPE_META[selected.type]?.icon} {selected.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{TYPE_META[selected.type]?.label}{selected.code ? ` · ${selected.code}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => renameLocation(selected)} style={{ fontSize: 12 }}>✏️ Renombrar</button>
                  <button className="btn btn-ghost" onClick={() => toggleActive(selected)} style={{ fontSize: 12 }}>{selected.is_active ? "📥 Archivar" : "📤 Reactivar"}</button>
                  <button className="btn btn-ghost" onClick={() => deleteLocation(selected)} style={{ fontSize: 12, color: "var(--warn)" }}>🗑 Eliminar</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdjustModal(true)}>+ Ajustar Stock</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowTransferModal(true)}>⇄ Transferir</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={openHistory}>🕒 Historial</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowAddUnitModal(true)}>+ Agregar Equipo</button>
              </div>

              {selectedChildren.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>SUB-UBICACIONES ({selectedChildren.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectedChildren.map(c => (
                      <span key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: "pointer", padding: "4px 10px", borderRadius: 20, background: "var(--surface-2)", fontSize: 12 }}>
                        {TYPE_META[c.type]?.icon} {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>STOCK EN ESTA UBICACIÓN ({selectedStock.length})</div>
                {selectedStock.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>Sin productos asignados aquí todavía.</p>
                ) : (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {selectedStock.map((s, idx) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: idx < selectedStock.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <div>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--amber)" }}>{s.catalog_items?.item_code}</div>
                          <div style={{ fontSize: 13 }}>{s.catalog_items?.description}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: s.quantity <= 0 ? "var(--warn)" : "var(--navy)" }}>{s.quantity}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>EQUIPO SERIALIZADO ({selectedUnits.length})</div>
                <input
                  value={unitSearch}
                  onChange={e => setUnitSearch(e.target.value)}
                  placeholder="🔍 Buscar equipo (serial, descripción)..."
                  style={{ width: "100%", padding: "8px 10px", marginBottom: 8, border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                />
                {selectedUnits.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>Sin equipo registrado aquí todavía.</p>
                ) : (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {selectedUnits.map((u, idx) => (
                      <div key={u.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: idx < selectedUnits.length - 1 ? "1px solid var(--border)" : "none" }}>
                        {u.photo_signed_url ? (
                          <img src={u.photo_signed_url} alt={u.serial_number} onClick={() => setLightboxUrl(u.photo_signed_url)}
                            style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, cursor: "zoom-in", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📦</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13 }}>{u.catalog_items?.description}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--amber)" }}>SN: {u.serial_number}</div>
                          {u.notes && <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.notes}</div>}
                        </div>
                        <button onClick={() => deleteUnit(u)} style={{ background: "none", border: "none", color: "var(--warn)", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>🗑</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: + Nueva Ubicación */}
      {showAddModal && (
        <Modal title="+ Nueva Ubicación" onClose={() => setShowAddModal(false)}>
          <Field label="Nombre">
            <input autoFocus value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Tipo">
            <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
              {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
            </select>
          </Field>
          <Field label="Código (opcional)">
            <input value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))} placeholder="WH-001" style={{ ...inputStyle, fontFamily: "monospace" }} />
          </Field>
          <Field label="Ubicación padre (opcional)">
            <select value={addForm.parent_id} onChange={e => setAddForm(f => ({ ...f, parent_id: e.target.value }))} style={inputStyle}>
              <option value="">Ninguna (raíz)</option>
              {flatOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <ModalActions onCancel={() => setShowAddModal(false)} onConfirm={addLocation} saving={saving} label="Crear" />
        </Modal>
      )}

      {/* Modal: Bulk Create */}
      {showBulkModal && (
        <Modal title="📑 Bulk Create" onClose={() => setShowBulkModal(false)}>
          <Field label="Prefijo del nombre">
            <input autoFocus value={bulkForm.prefix} onChange={e => setBulkForm(f => ({ ...f, prefix: e.target.value }))} placeholder="Estante" style={inputStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Desde #"><input type="number" value={bulkForm.start} onChange={e => setBulkForm(f => ({ ...f, start: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Hasta #"><input type="number" value={bulkForm.end} onChange={e => setBulkForm(f => ({ ...f, end: e.target.value }))} style={inputStyle} /></Field>
          </div>
          <Field label="Tipo">
            <select value={bulkForm.type} onChange={e => setBulkForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
              {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
            </select>
          </Field>
          <Field label="Prefijo de código (opcional)">
            <input value={bulkForm.codePrefix} onChange={e => setBulkForm(f => ({ ...f, codePrefix: e.target.value }))} placeholder="EST" style={{ ...inputStyle, fontFamily: "monospace" }} />
          </Field>
          <Field label="Ubicación padre (opcional)">
            <select value={bulkForm.parent_id} onChange={e => setBulkForm(f => ({ ...f, parent_id: e.target.value }))} style={inputStyle}>
              <option value="">Ninguna (raíz)</option>
              {flatOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Se crearán {Math.max(0, (parseInt(bulkForm.end) || 0) - (parseInt(bulkForm.start) || 0) + 1)} ubicaciones: "{bulkForm.prefix} {bulkForm.start}" … "{bulkForm.prefix} {bulkForm.end}".
          </p>
          <ModalActions onCancel={() => setShowBulkModal(false)} onConfirm={bulkCreate} saving={saving} label="Crear todas" />
        </Modal>
      )}

      {/* Modal: Ajustar Stock */}
      {showAdjustModal && selected && (
        <Modal title={`+ Ajustar Stock en ${selected.name}`} onClose={() => setShowAdjustModal(false)}>
          <Field label="Producto">
            <select value={adjustForm.catalog_item_id} onChange={e => setAdjustForm(f => ({ ...f, catalog_item_id: e.target.value }))} style={inputStyle}>
              <option value="">Selecciona un producto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.item_code} — {p.description}</option>)}
            </select>
          </Field>
          <Field label="Cantidad (negativo para restar)">
            <input type="number" value={adjustForm.delta} onChange={e => setAdjustForm(f => ({ ...f, delta: e.target.value }))} placeholder="10 o -5" style={inputStyle} />
          </Field>
          <Field label="Motivo (opcional)">
            <input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="Recibido de suplidor" style={inputStyle} />
          </Field>
          <ModalActions onCancel={() => setShowAdjustModal(false)} onConfirm={adjustStock} saving={saving} label="Ajustar" />
        </Modal>
      )}

      {/* Modal: Agregar Equipo (serializado) */}
      {showAddUnitModal && selected && (
        <Modal title={`+ Agregar Equipo en ${selected.name}`} onClose={closeAddUnitModal}>
          <Field label="Producto">
            <select value={unitForm.catalog_item_id} onChange={e => setUnitForm(f => ({ ...f, catalog_item_id: e.target.value }))} style={inputStyle}>
              <option value="">Selecciona un producto...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.item_code} — {p.description}</option>)}
            </select>
          </Field>
          <Field label="Serial number">
            <div style={{ display: "flex", gap: 6 }}>
              <input value={unitForm.serial_number} onChange={e => setUnitForm(f => ({ ...f, serial_number: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => setShowUnitScanner(true)} title="Escanear código de barra" className="btn btn-ghost" style={{ padding: "0 14px" }}>📷</button>
            </div>
          </Field>
          <Field label="Notas (opcional)">
            <input value={unitForm.notes} onChange={e => setUnitForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Foto (opcional)">
            {unitPhotoPreview && <img src={unitPhotoPreview} alt="preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8, display: "block" }} />}
            <input type="file" accept="image/*" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUnitPhotoFile(file);
              setUnitPhotoPreview(URL.createObjectURL(file));
            }} style={inputStyle} />
          </Field>
          {unitError && <p style={{ fontSize: 12, color: "var(--warn)" }}>{unitError}</p>}
          <ModalActions onCancel={closeAddUnitModal} onConfirm={addUnit} saving={savingUnit} label="Guardar" />
        </Modal>
      )}

      {/* Lightbox: foto de equipo a pantalla completa */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, cursor: "zoom-out" }}>
          <button onClick={() => setLightboxUrl(null)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, borderRadius: "50%", width: 40, height: 40, cursor: "pointer" }}>✕</button>
          <img src={lightboxUrl} alt="equipo" onClick={e => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}

      {showUnitScanner && (
        <BarcodeScanner
          onScan={code => { setUnitForm(f => ({ ...f, serial_number: code })); setShowUnitScanner(false); }}
          onClose={() => setShowUnitScanner(false)}
        />
      )}

      {/* Modal: Transferir Stock */}
      {showTransferModal && selected && (
        <Modal title={`⇄ Transferir desde ${selected.name}`} onClose={() => setShowTransferModal(false)}>
          <Field label="Producto">
            <select value={transferForm.catalog_item_id} onChange={e => setTransferForm(f => ({ ...f, catalog_item_id: e.target.value }))} style={inputStyle}>
              <option value="">Selecciona un producto...</option>
              {selectedStock.map(s => <option key={s.catalog_item_id} value={s.catalog_item_id}>{s.catalog_items?.item_code} — {s.catalog_items?.description} (disponible: {s.quantity})</option>)}
            </select>
          </Field>
          <Field label="Ubicación destino">
            <select value={transferForm.to_location_id} onChange={e => setTransferForm(f => ({ ...f, to_location_id: e.target.value }))} style={inputStyle}>
              <option value="">Selecciona destino...</option>
              {flatOptions.filter(o => o.id !== selectedId).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Cantidad">
            <input type="number" value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Motivo (opcional)">
            <input value={transferForm.reason} onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reabastecer estante" style={inputStyle} />
          </Field>
          <ModalActions onCancel={() => setShowTransferModal(false)} onConfirm={transferStock} saving={saving} label="Transferir" />
        </Modal>
      )}

      {/* Modal: Historial */}
      {showHistory && selected && (
        <Modal title={`🕒 Historial — ${selected.name}`} onClose={() => setShowHistory(false)} wide>
          {loadingHistory ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Cargando...</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Sin movimientos registrados en esta ubicación.</p>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {history.map(h => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.catalog_items?.item_code} — {h.catalog_items?.description}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {h.reason}{h.transfer_group_id ? " · transferencia" : ""} · {new Date(h.created_at).toLocaleString("es-PR")}
                      {h.created_by ? ` · ${h.created_by}` : ""}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: h.delta < 0 ? "var(--warn)" : "#0e8f7a" }}>{h.delta > 0 ? `+${h.delta}` : h.delta}</div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, saving, label }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
      <button onClick={onCancel} className="btn btn-ghost">Cancelar</button>
      <button onClick={onConfirm} disabled={saving} className="btn btn-primary">{saving ? "Guardando..." : label}</button>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: "100%", maxWidth: wide ? 520 : 380, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
