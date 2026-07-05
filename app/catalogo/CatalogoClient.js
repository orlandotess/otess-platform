"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const TYPE_META = {
  labor: { label: "Labor", icon: "🔧", color: "#e0972c" },
  product: { label: "Productos", icon: "📦", color: "#2a4cb5" },
  catalog_view: { label: "Catálogo", icon: "🗂️", color: "#0e8f7a" },
};

export default function CatalogoClient({ items: initial }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState("labor");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ item_code: "", description: "", price: "", msrp: "", supplier_price: "" });
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

  const counts = { labor: items.filter(i => i.type === "labor").length, product: items.filter(i => i.type === "product").length };
  counts.catalog_view = counts.product;

  const filtered = items.filter(i => i.type === dataType && (
    i.item_code.toLowerCase().includes(search.toLowerCase()) ||
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
    setEditForm({ item_code: item.item_code, description: item.description, price: item.price, msrp: item.msrp ?? "", supplier_price: item.supplier_price ?? "" });
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
      description: editForm.description.trim(),
      price: parseFloat(editForm.price) || 0,
      msrp: editForm.msrp !== "" ? parseFloat(editForm.msrp) : null,
      supplier_price: editForm.supplier_price !== "" ? parseFloat(editForm.supplier_price) : null,
    };
    if (editPhotoFile) {
      const path = await uploadPhoto(editPhotoFile);
      if (path) payload.photo_url = path;
    }
    await supabase.from("catalog_items").update(payload).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...payload } : i));
    setEditingId(null);
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setSaving(false);
  }

  async function deleteItem(id) {
    if (!confirm("¿Eliminar este ítem?")) return;
    await supabase.from("catalog_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function addItem() {
    if (!newItem.item_code.trim() || !newItem.description.trim()) return;
    setSaving(true);
    let photo_url = null;
    if (newPhotoFile) photo_url = await uploadPhoto(newPhotoFile);
    const { data } = await supabase.from("catalog_items").insert([{
      type: dataType,
      item_code: newItem.item_code.trim(),
      description: newItem.description.trim(),
      price: parseFloat(newItem.price) || 0,
      msrp: newItem.msrp !== "" ? parseFloat(newItem.msrp) : null,
      supplier_price: newItem.supplier_price !== "" ? parseFloat(newItem.supplier_price) : null,
      photo_url,
    }]).select().single();
    if (data) setItems(prev => [...prev, data]);
    setNewItem({ item_code: "", description: "", price: "", msrp: "", supplier_price: "" });
    setNewPhotoFile(null);
    setNewPhotoPreview(null);
    setAdding(false);
    setSaving(false);
  }

  function exportCSV() {
    const rows = filtered.map(i => [i.item_code, i.description, i.price, i.msrp ?? "", i.supplier_price ?? ""]);
    const csvContent = [["Item Code", "Descripcion", "Precio", "MSRP", "Costo Suplidor"], ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${dataType === "labor" ? "Labor" : "Productos"}_OTESS.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowMenu(false);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const dataLines = lines[0]?.toLowerCase().includes("item code") ? lines.slice(1) : lines;

    const toInsert = dataLines.map(line => {
      const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      return { type: dataType, item_code: cols[0] || "", description: cols[1] || "", price: parseFloat(cols[2]) || 0, msrp: cols[3] ? parseFloat(cols[3]) : null, supplier_price: cols[4] ? parseFloat(cols[4]) : null };
    }).filter(i => i.item_code && i.description);

    if (toInsert.length === 0) { alert("No se encontraron filas válidas en el CSV."); return; }

    setSaving(true);
    const { data, error } = await supabase.from("catalog_items").insert(toInsert).select();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    if (data) setItems(prev => [...prev, ...data]);
    alert(`${data.length} ítems importados correctamente.`);
    e.target.value = "";
    setShowMenu(false);
  }

  const fmt = n => n == null ? null : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar en ${TYPE_META[tab].label}...`}
          style={{ width: "100%", padding: "14px 16px 14px 42px", border: "1.5px solid var(--border)", borderRadius: 12, fontSize: 15, background: "#fff" }} />
      </div>

      {/* Category cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24, maxWidth: 400 }}>
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <div key={key} onClick={() => setTab(key)}
            style={{
              background: "#fff", borderRadius: 14, padding: "20px 16px", cursor: "pointer", textAlign: "center",
              border: tab === key ? `2.5px solid ${meta.color}` : "2.5px solid transparent",
              boxShadow: tab === key ? `0 4px 16px ${meta.color}33` : "0 1px 4px rgba(0,0,0,0.06)",
            }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{meta.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>{meta.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{counts[key]} ítems</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>
          {TYPE_META[tab].icon} {TYPE_META[tab].label} ({filtered.length})
        </p>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <button className="btn btn-ghost" onClick={() => setShowMenu(m => !m)}>⋮ Más</button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 11, minWidth: 180, overflow: "hidden" }}>
                <button onClick={exportCSV} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>⬇ Exportar CSV</button>
                <button onClick={() => { fileRef.current?.click(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>⬆ Importar CSV</button>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          <button className="btn btn-amber" onClick={() => setAdding(true)}>+ Nuevo</button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: "#fff", border: "1.5px dashed var(--amber)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ cursor: "pointer", flexShrink: 0 }}>
              {newPhotoPreview ? (
                <img src={newPhotoPreview} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: "#f4f6f9", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "var(--muted)" }}>📷</div>
              )}
              <input ref={newPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setNewPhotoFile(f); setNewPhotoPreview(URL.createObjectURL(f)); }
              }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px 90px 90px", gap: 8, alignItems: "center", flex: 1 }}>
              <input value={newItem.item_code} onChange={e => setNewItem(f => ({ ...f, item_code: e.target.value }))} placeholder="Item Code" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
              <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
              <input type="number" value={newItem.msrp} onChange={e => setNewItem(f => ({ ...f, msrp: e.target.value }))} placeholder="MSRP" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--muted)" }} />
              <input type="number" value={newItem.price} onChange={e => setNewItem(f => ({ ...f, price: e.target.value }))} placeholder="Precio venta" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
              <input type="number" value={newItem.supplier_price} onChange={e => setNewItem(f => ({ ...f, supplier_price: e.target.value }))} placeholder="Costo" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "#c0392b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setAdding(false); setNewPhotoFile(null); setNewPhotoPreview(null); }} className="btn btn-ghost">Cancelar</button>
            <button onClick={addItem} disabled={saving} className="btn btn-primary">{saving ? "Guardando..." : "Guardar ítem"}</button>
          </div>
        </div>
      )}

      {/* List of items (filas horizontales estilo Portal.io) */}
      {filtered.length === 0 ? (
        <div className="empty"><p>No hay ítems {dataType === "labor" ? "de labor" : "de productos"} aún.</p></div>
      ) : isCardView ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(item => {
            const margin = item.price > 0 && item.supplier_price != null
              ? Math.round(((item.price - item.supplier_price) / item.price) * 100) : null;
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
                {editingId === item.id ? (
                  <>
                    <label style={{ cursor: "pointer", alignSelf: "center" }}>
                      {editPhotoPreview ? (
                        <img src={editPhotoPreview} style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8, background: "#f4f6f9" }} />
                      ) : (
                        <div style={{ width: 80, height: 80, borderRadius: 8, background: "#f4f6f9", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "var(--muted)" }}>📷</div>
                      )}
                      <input ref={editPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setEditPhotoFile(f); setEditPhotoPreview(URL.createObjectURL(f)); }
                      }} />
                    </label>
                    <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} placeholder="Item Code" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }} />
                    <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
                    <input type="number" value={editForm.msrp} onChange={e => setEditForm(f => ({ ...f, msrp: e.target.value }))} placeholder="MSRP" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }} />
                    <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder="Precio" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
                    <input type="number" value={editForm.supplier_price} onChange={e => setEditForm(f => ({ ...f, supplier_price: e.target.value }))} placeholder="Costo" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "#c0392b" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px", flex: 1, justifyContent: "center" }}>💾 Guardar</button>
                      <button onClick={() => { setEditingId(null); setEditPhotoFile(null); setEditPhotoPreview(null); }} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>✕</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: "100%", height: 110, borderRadius: 8, background: "#f4f6f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, overflow: "hidden" }}>
                      {item.photo_url && signedUrls[item.photo_url] ? (
                        <img src={signedUrls[item.photo_url]} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : "📦"}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{item.item_code}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, minHeight: 34 }}>{item.description}</div>
                    <div>
                      {item.msrp != null && <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>msrp {fmt(item.msrp)}</div>}
                      <div style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>{fmt(item.price)}</div>
                      {item.supplier_price != null && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#c0392b" }}>
                          <span>Costo: {fmt(item.supplier_price)}</span>
                          {margin != null && <span style={{ color: margin >= 0 ? "#0e8f7a" : "#c0392b", fontWeight: 700 }}>{margin}%</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", flex: 1, justifyContent: "center" }}>✏️ Editar</button>
                      <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          {filtered.map((item, idx) => (
            <div key={item.id} style={{ padding: "14px 18px", borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
              {editingId === item.id ? (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <label style={{ cursor: "pointer", flexShrink: 0 }}>
                    {editPhotoPreview ? (
                      <img src={editPhotoPreview} style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, background: "#f4f6f9" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 8, background: "#f4f6f9", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "var(--muted)" }}>📷</div>
                    )}
                    <input ref={editPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setEditPhotoFile(f); setEditPhotoPreview(URL.createObjectURL(f)); }
                    }} />
                  </label>
                  <div style={{ flex: 1, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} placeholder="Item Code" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace", width: 140 }} />
                      <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, flex: 1 }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>💾 Guardar</button>
                      <button onClick={() => { setEditingId(null); setEditPhotoFile(null); setEditPhotoPreview(null); }} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>✕ Cancelar</button>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, width: 100 }}>
                    <input type="number" value={editForm.msrp} onChange={e => setEditForm(f => ({ ...f, msrp: e.target.value }))} placeholder="MSRP" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--muted)", textAlign: "right", width: "100%", marginBottom: 3 }} />
                    <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder="Precio" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700, textAlign: "right", width: "100%", marginBottom: 3 }} />
                    <input type="number" value={editForm.supplier_price} onChange={e => setEditForm(f => ({ ...f, supplier_price: e.target.value }))} placeholder="Costo" step="0.01" style={{ padding: "4px 6px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 11, color: "#c0392b", textAlign: "right", width: "100%" }} />
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, background: "#f4f6f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, overflow: "hidden" }}>
                    {item.photo_url && signedUrls[item.photo_url] ? (
                      <img src={signedUrls[item.photo_url]} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      TYPE_META[item.type]?.icon ?? "📦"
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{item.item_code}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.description}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, width: 110 }}>
                    {item.msrp != null && <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>msrp {fmt(item.msrp)}</div>}
                    <div style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>{fmt(item.price)}</div>
                    {item.supplier_price != null && <div style={{ fontSize: 11, color: "#c0392b" }}>Costo: {fmt(item.supplier_price)}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>✏️ Editar</button>
                    <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
