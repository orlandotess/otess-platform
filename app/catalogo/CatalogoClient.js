"use client";
import { useState, useRef } from "react";
import { supabase } from "../../lib/supabase";

const TYPE_META = {
  labor: { label: "Labor", icon: "🔧", color: "#e0972c" },
  product: { label: "Productos", icon: "📦", color: "#2a4cb5" },
};

export default function CatalogoClient({ items: initial }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState("labor");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ item_code: "", description: "", price: "", msrp: "", supplier_price: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const fileRef = useRef();

  const counts = { labor: items.filter(i => i.type === "labor").length, product: items.filter(i => i.type === "product").length };

  const filtered = items.filter(i => i.type === tab && (
    i.item_code.toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase())
  ));

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({ item_code: item.item_code, description: item.description, price: item.price, msrp: item.msrp ?? "", supplier_price: item.supplier_price ?? "" });
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
    await supabase.from("catalog_items").update(payload).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...payload } : i));
    setEditingId(null);
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
    const { data } = await supabase.from("catalog_items").insert([{
      type: tab,
      item_code: newItem.item_code.trim(),
      description: newItem.description.trim(),
      price: parseFloat(newItem.price) || 0,
      msrp: newItem.msrp !== "" ? parseFloat(newItem.msrp) : null,
      supplier_price: newItem.supplier_price !== "" ? parseFloat(newItem.supplier_price) : null,
    }]).select().single();
    if (data) setItems(prev => [...prev, data]);
    setNewItem({ item_code: "", description: "", price: "", msrp: "", supplier_price: "" });
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
    link.download = `${tab === "labor" ? "Labor" : "Productos"}_OTESS.csv`;
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
      return { type: tab, item_code: cols[0] || "", description: cols[1] || "", price: parseFloat(cols[2]) || 0, msrp: cols[3] ? parseFloat(cols[3]) : null, supplier_price: cols[4] ? parseFloat(cols[4]) : null };
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
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px 90px 90px", gap: 8, alignItems: "center" }}>
            <input value={newItem.item_code} onChange={e => setNewItem(f => ({ ...f, item_code: e.target.value }))} placeholder="Item Code" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
            <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <input type="number" value={newItem.msrp} onChange={e => setNewItem(f => ({ ...f, msrp: e.target.value }))} placeholder="MSRP" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--muted)" }} />
            <input type="number" value={newItem.price} onChange={e => setNewItem(f => ({ ...f, price: e.target.value }))} placeholder="Precio venta" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
            <input type="number" value={newItem.supplier_price} onChange={e => setNewItem(f => ({ ...f, supplier_price: e.target.value }))} placeholder="Costo" step="0.01" style={{ padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "#c0392b" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setAdding(false)} className="btn btn-ghost">Cancelar</button>
            <button onClick={addItem} disabled={saving} className="btn btn-primary">{saving ? "Guardando..." : "Guardar ítem"}</button>
          </div>
        </div>
      )}

      {/* Grid of items */}
      {filtered.length === 0 ? (
        <div className="empty"><p>No hay ítems {tab === "labor" ? "de labor" : "de productos"} aún.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column" }}>
              {editingId === item.id ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }} />
                  <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
                  <input type="number" value={editForm.msrp} onChange={e => setEditForm(f => ({ ...f, msrp: e.target.value }))} placeholder="MSRP" step="0.01" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--muted)" }} />
                  <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder="Precio venta" step="0.01" style={{ padding: "6px 10px", border: "1.5px solid var(--amber)", borderRadius: 6, fontSize: 13, fontWeight: 700 }} />
                  <input type="number" value={editForm.supplier_price} onChange={e => setEditForm(f => ({ ...f, supplier_price: e.target.value }))} placeholder="Costo suplidor" step="0.01" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12, color: "#c0392b" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: "6px 0", justifyContent: "center" }}>💾 Guardar</button>
                    <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }}>✕</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 64, background: "#f4f6f9", borderRadius: 10, marginBottom: 10, fontSize: 28 }}>
                    {TYPE_META[item.type]?.icon ?? "📦"}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--amber)", marginBottom: 4 }}>{item.item_code}</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8, flex: 1 }}>{item.description}</div>
                  <div style={{ marginBottom: 10 }}>
                    {item.msrp != null && <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>MSRP {fmt(item.msrp)}</div>}
                    <div style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>{fmt(item.price)}</div>
                    {item.supplier_price != null && <div style={{ fontSize: 11, color: "#c0392b" }}>Costo: {fmt(item.supplier_price)}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: "6px 0", justifyContent: "center" }}>✏️ Editar</button>
                    <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px", color: "var(--warn)" }}>🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
