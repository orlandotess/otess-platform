"use client";
import { useState, useRef } from "react";
import { supabase } from "../../lib/supabase";

export default function CatalogoClient({ items: initial }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState("labor");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ item_code: "", description: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef();

  const filtered = items.filter(i => i.type === tab && (
    i.item_code.toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase())
  ));

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({ item_code: item.item_code, description: item.description, price: item.price });
  }

  async function saveEdit(id) {
    setSaving(true);
    await supabase.from("catalog_items").update({
      item_code: editForm.item_code.trim(),
      description: editForm.description.trim(),
      price: parseFloat(editForm.price) || 0,
    }).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...editForm, price: parseFloat(editForm.price) || 0 } : i));
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
    }]).select().single();
    if (data) setItems(prev => [...prev, data]);
    setNewItem({ item_code: "", description: "", price: "" });
    setAdding(false);
    setSaving(false);
  }

  function exportCSV() {
    const rows = filtered.map(i => [i.item_code, i.description, i.price]);
    const csvContent = [["Item Code", "Descripcion", "Precio"], ...rows]
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
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const dataLines = lines[0]?.toLowerCase().includes("item code") ? lines.slice(1) : lines;

    const toInsert = dataLines.map(line => {
      const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      return { type: tab, item_code: cols[0] || "", description: cols[1] || "", price: parseFloat(cols[2]) || 0 };
    }).filter(i => i.item_code && i.description);

    if (toInsert.length === 0) { alert("No se encontraron filas válidas en el CSV."); return; }

    setSaving(true);
    const { data, error } = await supabase.from("catalog_items").insert(toInsert).select();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    if (data) setItems(prev => [...prev, ...data]);
    alert(`${data.length} ítems importados correctamente.`);
    e.target.value = "";
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setTab("labor")} className={`btn ${tab === "labor" ? "btn-primary" : "btn-ghost"}`}>🔧 Labor</button>
            <button onClick={() => setTab("product")} className={`btn ${tab === "product" ? "btn-primary" : "btn-ghost"}`}>📦 Productos</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar código o descripción..."
              style={{ padding: "8px 14px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, width: 220 }} />
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ Exportar CSV</button>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>⬆ Importar CSV</button>
            <button className="btn btn-amber" onClick={() => setAdding(true)}>+ Nuevo</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>
            {tab === "labor" ? "🔧 Labor" : "📦 Productos"} ({filtered.length})
          </p>
        </div>

        {adding && (
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px 80px", gap: 8, marginBottom: 12, padding: "12px 14px", background: "#f8f9fb", borderRadius: 8, alignItems: "center" }}>
            <input value={newItem.item_code} onChange={e => setNewItem(f => ({ ...f, item_code: e.target.value }))} placeholder="Item Code" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
            <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <input type="number" value={newItem.price} onChange={e => setNewItem(f => ({ ...f, price: e.target.value }))} placeholder="0.00" step="0.01" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={addItem} disabled={saving} style={{ background: "var(--navy)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>✓</button>
              <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>×</button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty"><p>No hay ítems {tab === "labor" ? "de labor" : "de productos"} aún.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: "right" }}>Precio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    {editingId === item.id ? (
                      <>
                        <td><input value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace", width: "100%" }} /></td>
                        <td><input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, width: "100%" }} /></td>
                        <td><input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} step="0.01" style={{ padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 13, width: 100, textAlign: "right" }} /></td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => saveEdit(item.id)} disabled={saving} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12 }}>💾</button>
                          <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--amber)" }}>{item.item_code}</td>
                        <td style={{ fontWeight: 500 }}>{item.description}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>${Number(item.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => startEdit(item)} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>✏️</button>
                          <button onClick={() => deleteItem(item.id)} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, color: "var(--warn)" }}>🗑</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
