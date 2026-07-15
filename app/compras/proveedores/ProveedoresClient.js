'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const emptyForm = { name: '', contact_name: '', email: '', phone: '', notes: '' };

export default function ProveedoresClient({ initialVendors }) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initialVendors);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function startEdit(v) {
    setEditingId(v.id);
    setForm({ name: v.name ?? '', contact_name: v.contact_name ?? '', email: v.email ?? '', phone: v.phone ?? '', notes: v.notes ?? '' });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { alert('El nombre es requerido.'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from('vendors').update(payload).eq('id', editingId);
      setSaving(false);
      if (error) { alert('Error: ' + error.message); return; }
      setVendors(prev => prev.map(v => v.id === editingId ? { ...v, ...payload } : v).sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      const { data, error } = await supabase.from('vendors').insert([payload]).select().single();
      setSaving(false);
      if (error) { alert('Error: ' + error.message); return; }
      setVendors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    router.refresh();
  }

  async function deleteVendor() {
    setDeleting(true);
    const { error } = await supabase.from('vendors').delete().eq('id', editingId);
    setDeleting(false);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    setVendors(prev => prev.filter(v => v.id !== editingId));
    setShowDelete(false);
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    router.refresh();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Proveedores</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/compras" className="btn btn-ghost">← Compras</Link>
          <button className="btn btn-primary" onClick={startNew}>+ Nuevo proveedor</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: 14 }}>{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
          <div className="form-row">
            <div className="form-group">
              <label>Nombre *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="form-group">
              <label>Contacto</label>
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nombre de contacto" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@proveedor.com" />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="787-000-0000" />
            </div>
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas internas..." />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(emptyForm); setEditingId(null); }}>Cancelar</button>
            {editingId && (
              <button className="btn btn-ghost" style={{ color: 'var(--warn)', marginLeft: 'auto' }} onClick={() => setShowDelete(true)}>🗑 Eliminar</button>
            )}
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar proveedor?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer. Si tiene órdenes de compra asociadas, no se podrá eliminar.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteVendor} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          No hay proveedores todavía. Se crean automáticamente al generar una orden de compra, o puedes agregarlos aquí.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {vendors.map((v, i) => (
            <div key={v.id} onClick={() => startEdit(v)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: i < vendors.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{v.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                  {[v.contact_name, v.email, v.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
