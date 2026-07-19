'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import ClientCombobox from '../facturas/nueva/ClientCombobox';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function MantenimientoForm({ editing, technicians, clients, clientProperties, onSaved, onCancel }) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [clientId, setClientId] = useState(editing?.client_id ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [technicianIds, setTechnicianIds] = useState(() => editing
    ? [editing.technician_id, ...(editing.recurring_maintenance_technicians ?? []).map(t => t.technician_id)].filter(Boolean)
    : []);
  const [frequency, setFrequency] = useState(editing?.frequency ?? 'monthly');
  const [nextRunDate, setNextRunDate] = useState(editing?.next_run_date ?? todayISO());
  const [timeOfDay, setTimeOfDay] = useState(editing?.time_of_day ?? '09:00');
  const [items, setItems] = useState(() => {
    const existing = (editing?.recurring_maintenance_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(i => i.text);
    return existing.length ? existing : [''];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const clientProps = (clientProperties ?? []).filter(p => p.client_id === clientId);
  const canSubmit = title.trim() && clientId && nextRunDate;

  function toggleTechnician(id) {
    setTechnicianIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  }

  function selectProperty(id) {
    setPropertyId(id);
    const p = clientProps.find(p => p.id === id);
    if (p) setAddress([p.street, p.city, p.state, p.zip].filter(Boolean).join(', '));
  }

  function updateItem(i, value) {
    setItems(list => list.map((it, idx) => idx === i ? value : it));
  }
  function addItem() {
    setItems(list => [...list, '']);
  }
  function removeItem(i) {
    setItems(list => list.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!canSubmit) {
      setError('Completa título, cliente y próxima visita');
      return;
    }
    setSaving(true);
    setError('');

    const runDate = new Date(nextRunDate + 'T00:00:00');
    const cleanItems = items.map(i => i.trim()).filter(Boolean);

    const payload = {
      client_id: clientId,
      title: title.trim(),
      address: address.trim() || null,
      notes: notes.trim() || null,
      frequency,
      day_of_month: frequency === 'weekly' ? null : runDate.getDate(),
      day_of_week: frequency === 'weekly' ? runDate.getDay() : null,
      time_of_day: timeOfDay,
      technician_id: technicianIds[0] ?? null,
      next_run_date: nextRunDate,
    };

    let planId = editing?.id;
    if (editing) {
      const { error: err } = await supabase.from('recurring_maintenances').update(payload).eq('id', editing.id);
      if (err) { setSaving(false); setError(err.message); return; }
      await supabase.from('recurring_maintenance_technicians').delete().eq('recurring_maintenance_id', editing.id);
      await supabase.from('recurring_maintenance_items').delete().eq('recurring_maintenance_id', editing.id);
    } else {
      const { data, error: err } = await supabase.from('recurring_maintenances').insert([{ ...payload, active: true }]).select().single();
      if (err) { setSaving(false); setError(err.message); return; }
      planId = data.id;
    }

    if (technicianIds.length > 1) {
      const { error: techErr } = await supabase.from('recurring_maintenance_technicians').insert(
        technicianIds.slice(1).map(technician_id => ({ recurring_maintenance_id: planId, technician_id }))
      );
      if (techErr) { setSaving(false); setError(techErr.message); return; }
    }
    if (cleanItems.length) {
      const { error: itemsErr } = await supabase.from('recurring_maintenance_items').insert(
        cleanItems.map((text, i) => ({ recurring_maintenance_id: planId, text, sort_order: i }))
      );
      if (itemsErr) { setSaving(false); setError(itemsErr.message); return; }
    }

    const { data: fresh } = await supabase
      .from('recurring_maintenances')
      .select('*, clients(id, name), technicians(id, name), recurring_maintenance_technicians(technician_id, technicians(id, name)), recurring_maintenance_items(id, text, sort_order)')
      .eq('id', planId)
      .single();

    setSaving(false);
    if (fresh) onSaved(fresh);
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>{editing ? 'Editar mantenimiento recurrente' : 'Nuevo mantenimiento recurrente'}</p>
      {error && <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <div className="form-group">
          <label>Título de la visita</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Verificación de cámaras" />
        </div>

        <div className="form-group">
          <label>Cliente</label>
          <ClientCombobox clients={clients} value={clientId} onChange={id => { setClientId(id); setPropertyId(''); }} />
        </div>

        <div className="form-group">
          <label>Dirección (opcional)</label>
          {clientProps.length > 0 && (
            <select value={propertyId} onChange={e => selectProperty(e.target.value)} style={{ marginBottom: 6 }}>
              <option value="">— Escoger propiedad del cliente —</option>
              {clientProps.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name ? `${p.name} — ` : ''}{[p.street, p.city].filter(Boolean).join(', ')}{p.is_primary ? ' (Principal)' : ''}
                </option>
              ))}
            </select>
          )}
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej. 123 Calle Sol, San Juan, PR" />
        </div>

        <div className="form-group">
          <label>Técnicos (puedes escoger más de uno)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {technicians.map(t => {
              const checked = technicianIds.includes(t.id);
              return (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: checked ? 'var(--navy)' : 'var(--surface)', color: checked ? '#fff' : 'var(--navy)', border: '1.5px solid var(--border)', borderRadius: 20, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleTechnician(t.id)} style={{ margin: 0 }} />
                  {t.name}
                </label>
              );
            })}
            {technicians.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No hay técnicos registrados.</p>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Frecuencia</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div className="form-group">
            <label>Próxima visita</label>
            <input type="date" value={nextRunDate} onChange={e => setNextRunDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Hora</label>
            <input type="time" value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -6 }}>
          {frequency === 'weekly'
            ? 'Se repetirá cada semana en el mismo día de la semana que escojas arriba.'
            : `Se repetirá cada ${frequency === 'monthly' ? 'mes' : frequency === 'quarterly' ? 'trimestre' : 'año'} en el día ${nextRunDate ? new Date(nextRunDate + 'T00:00:00').getDate() : ''} del mes.`}
        </p>

        <div className="form-group">
          <label>Notas (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 50 }} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Checklist de la visita</label>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input value={item} onChange={e => updateItem(i, e.target.value)} style={{ flex: 1 }} placeholder={`Ítem ${i + 1} — ej. Verificar grabación de cámaras`} />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="btn btn-ghost" style={{ padding: '4px 10px' }}>×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addItem} className="btn btn-ghost" style={{ fontSize: 12, alignSelf: 'flex-start' }}>+ Agregar ítem</button>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Cada vez que llegue la fecha, se creará automáticamente una tarea de checklist en el Calendario y en Crew App para {technicianIds.length > 1 ? 'los técnicos asignados' : 'el técnico asignado'}.
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !canSubmit}>
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
