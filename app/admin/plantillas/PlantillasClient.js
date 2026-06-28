'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function PlantillasClient({ templates: initial }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initial);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  async function saveTemplate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const { data: template } = await supabase.from('checklist_templates')
      .insert([{ name: name.trim(), description: description.trim() || null }])
      .select().single();

    if (template) {
      const validItems = items.filter(i => i.trim()).map((desc, idx) => ({
        template_id: template.id, description: desc.trim(), sort_order: idx,
      }));
      if (validItems.length) {
        const { data: insertedItems } = await supabase.from('checklist_template_items').insert(validItems).select();
        template.checklist_template_items = insertedItems ?? [];
      } else {
        template.checklist_template_items = [];
      }
      setTemplates(prev => [...prev, template]);
    }

    setName(''); setDescription(''); setItems(['']); setShowNew(false); setSaving(false);
  }

  async function deleteTemplate(id) {
    await supabase.from('checklist_template_items').delete().eq('template_id', id);
    await supabase.from('checklist_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showNew ? 20 : 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Plantillas ({templates.length})</h2>
          <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
            {showNew ? 'Cancelar' : '+ Nueva plantilla'}
          </button>
        </div>

        {showNew && (
          <form onSubmit={saveTemplate}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Nombre de la plantilla *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Instalación CCTV" required />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Descripción (opcional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción breve..." />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Ítems del checklist</label>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={item} onChange={e => setItems(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                    placeholder={`Ítem ${idx + 1}...`} style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setItems(prev => [...prev, ''])}>
                + Agregar ítem
              </button>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : '💾 Guardar plantilla'}
            </button>
          </form>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="card empty"><p>No hay plantillas. Crea la primera arriba.</p></div>
      ) : (
        templates.map(t => (
          <div key={t.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                {t.description && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{t.description}</div>}
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.checklist_template_items?.length ?? 0} ítems</div>
              </div>
              <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, marginLeft: 12 }}>🗑</button>
            </div>

            {expanded === t.id && t.checklist_template_items?.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {t.checklist_template_items.sort((a, b) => a.sort_order - b.sort_order).map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, border: '2px solid var(--border)', flexShrink: 0 }} />
                    <span style={{ fontSize: 14 }}>{item.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
