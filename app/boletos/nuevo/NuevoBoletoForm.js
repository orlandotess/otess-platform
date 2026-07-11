'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../Sidebar';
import ClientCombobox from '../../facturas/nueva/ClientCombobox';

export default function NuevoBoletoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientParam = searchParams.get('client');

  const [clients, setClients] = useState([]);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState({
    client_id: clientParam || '', property_id: '', subject: '', description: '',
    contact_name: '', contact_email: '', contact_phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    if (!form.client_id) { setProperties([]); return; }
    supabase.from('client_properties').select('*').eq('client_id', form.client_id).order('is_primary', { ascending: false })
      .then(({ data }) => setProperties(data ?? []));
  }, [form.client_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.client_id && form.subject.trim().length > 1;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true); setError('');
    const { data, error } = await supabase.from('service_tickets').insert([{
      client_id: form.client_id,
      property_id: form.property_id || null,
      subject: form.subject.trim(),
      description: form.description.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      source: 'staff',
      status: 'abierto',
    }]).select().single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    router.push(`/boletos/${data.id}`);
  }

  return (
    <div className="admin-shell ds-boletos">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Abrir boleto de servicio</div>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 640 }}>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Cliente</label>
            <ClientCombobox clients={clients} value={form.client_id} onChange={v => set('client_id', v)} />
          </div>

          {properties.length > 0 && (
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Propiedad (opcional)</label>
              <select value={form.property_id} onChange={e => set('property_id', e.target.value)}>
                <option value="">Sin propiedad</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.street ? ` — ${p.street}` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>¿Cuál es el problema?</label>
            <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Ej: El cuadro telefónico no timbra" required />
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Detalles (opcional)</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} placeholder="Detalles del problema reportado..." />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Contacto (opcional)</label>
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nombre" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Teléfono</label>
              <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="787-000-0000" />
            </div>
          </div>

          {error && <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={!canSave || saving}>
              {saving ? 'Guardando...' : '🎫 Abrir boleto'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancelar</button>
          </div>
        </form>
      </main>
    </div>
  );
}
