'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const OPP_SELECT = 'id, name, client_id, contact_name, company_name, phone, email, value, stage_key, status, assigned_technician_id, next_follow_up, notes, created_at, clients(name), technicians(name)';

export function emptyOpportunity(defaultStageKey) {
  return {
    id: null,
    name: '', client_id: '', contact_name: '', company_name: '', phone: '', email: '',
    value: '', stage_key: defaultStageKey ?? '', status: 'open',
    assigned_technician_id: '', next_follow_up: '', notes: '',
  };
}

export default function OpportunityModal({ opp, stages, technicians, clients, onClose, onSaved, onDeleted, onClientCreated }) {
  const isNew = !opp.id;
  const [form, setForm] = useState({
    name: opp.name ?? '',
    client_id: opp.client_id ?? '',
    contact_name: opp.contact_name ?? '',
    company_name: opp.company_name ?? '',
    phone: opp.phone ?? '',
    email: opp.email ?? '',
    value: opp.value ?? '',
    stage_key: opp.stage_key ?? (stages[0]?.key ?? ''),
    status: opp.status ?? 'open',
    assigned_technician_id: opp.assigned_technician_id ?? '',
    next_follow_up: opp.next_follow_up ?? '',
    notes: opp.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function pickClient(clientId) {
    const c = clients.find(c => c.id === clientId);
    setForm(f => ({
      ...f,
      client_id: clientId,
      contact_name: f.contact_name || c?.name || '',
      company_name: f.company_name || c?.company || '',
      phone: f.phone || c?.phone || '',
      email: f.email || c?.email || '',
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (!form.stage_key) { setError('Selecciona una etapa'); return; }
    setSaving(true);
    setError('');

    const payload = {
      name: form.name.trim(),
      client_id: form.client_id || null,
      contact_name: form.contact_name.trim() || null,
      company_name: form.company_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      value: form.value === '' ? 0 : Number(form.value),
      stage_key: form.stage_key,
      status: form.status,
      assigned_technician_id: form.assigned_technician_id || null,
      next_follow_up: form.next_follow_up || null,
      notes: form.notes.trim() || null,
    };

    const query = isNew
      ? supabase.from('opportunities').insert([payload]).select(OPP_SELECT).single()
      : supabase.from('opportunities').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', opp.id).select(OPP_SELECT).single();

    const { data, error: err } = await query;
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved(data, isNew);
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la oportunidad "${form.name}"?`)) return;
    setSaving(true);
    const { error: err } = await supabase.from('opportunities').delete().eq('id', opp.id);
    if (err) { setError(err.message); setSaving(false); return; }
    onDeleted(opp.id);
  }

  async function handleConvertToClient() {
    const name = form.company_name.trim() || form.contact_name.trim() || form.name.trim();
    if (!name) { setError('Necesitas un nombre, empresa o contacto antes de convertir'); return; }
    setSaving(true);
    setError('');
    const { data: client, error: err } = await supabase.from('clients').insert([{
      name, client_type: 'final',
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company_name.trim() || null,
    }]).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    onClientCreated(client);
    setForm(f => ({ ...f, client_id: client.id }));
    setSaving(false);
  }

  const canConvert = !isNew && form.status === 'won' && !form.client_id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{isNew ? 'Nueva Oportunidad' : 'Editar Oportunidad'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        {error && <p style={{ color: 'var(--warn)', marginBottom: 14, fontSize: 13.5 }}>{error}</p>}

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Nombre de la oportunidad *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Instalación cámaras — Plaza Norte" />
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Cliente existente (opcional)</label>
          <select value={form.client_id} onChange={e => pickClient(e.target.value)}>
            <option value="">— Prospecto nuevo —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label>Contacto</label>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nombre del contacto" />
          </div>
          <div className="form-group">
            <label>Empresa</label>
            <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Empresa" />
          </div>
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label>Teléfono</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="787-000-0000" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label>Valor estimado ($)</label>
            <input type="number" min="0" step="0.01" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label>Etapa</label>
            <select value={form.stage_key} onChange={e => set('stage_key', e.target.value)}>
              {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label>Responsable</label>
            <select value={form.assigned_technician_id} onChange={e => set('assigned_technician_id', e.target.value)}>
              <option value="">— Sin asignar —</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Próximo seguimiento</label>
            <input type="date" value={form.next_follow_up} onChange={e => set('next_follow_up', e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Estado</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="open">Abierta</option>
            <option value="won">Ganada</option>
            <option value="lost">Perdida</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 18 }}>
          <label>Notas</label>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas internas..." />
        </div>

        {canConvert && (
          <div style={{ background: 'var(--badge-green-bg)', border: '1px solid var(--ok)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--navy)', marginBottom: 8 }}>Esta oportunidad está ganada pero no tiene un cliente vinculado.</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleConvertToClient} disabled={saving}>
              Convertir a Cliente
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          {!isNew && (
            <button className="btn btn-ghost" onClick={handleDelete} disabled={saving} style={{ color: 'var(--warn)' }}>
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
