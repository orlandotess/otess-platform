'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Sidebar from '../../Sidebar';

export default function NuevoCliente() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', client_type: 'final', email: '', phone: '', company: '', notes: '',
  });
  const [addr, setAddr] = useState({ line1: '', line2: '', city: '', zip: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setA = (k, v) => setAddr(a => ({ ...a, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError('');
    const { data: client, error: err } = await supabase
      .from('clients').insert([form]).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    if (addr.line1.trim()) {
      await supabase.from('client_addresses').insert([{
        client_id: client.id, ...addr, is_primary: true,
      }]);
    }
    router.push('/clientes');
  }

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Nuevo cliente</div>
        </div>
        <div className="card" style={{ maxWidth: 640 }}>
          <form onSubmit={handleSubmit}>
            {error && <p style={{ color: 'var(--warn)', marginBottom: 16, fontSize: 14 }}>{error}</p>}

            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Juan García" />
              </div>
              <div className="form-group">
                <label>Tipo de cliente</label>
                <select value={form.client_type} onChange={e => set('client_type', e.target.value)}>
                  <option value="final">Consumidor final (11.5%)</option>
                  <option value="b2b">Comerciante registrado B2B (4% labor)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Teléfono</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(787) 000-0000" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@ejemplo.com" />
              </div>
            </div>

            <div className="form-group">
              <label>Empresa / Negocio</label>
              <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Nombre de la empresa (opcional)" />
            </div>

            <div className="form-group">
              <label>Notas</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notas internas..." />
            </div>

            <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)', margin: '20px 0' }} />
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>Dirección principal</p>

            <div className="form-group">
              <label>Calle / Dirección</label>
              <input value={addr.line1} onChange={e => setA('line1', e.target.value)} placeholder="Calle 56, #2D8 Lomas de Carolina" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Ciudad / Pueblo</label>
                <input value={addr.city} onChange={e => setA('city', e.target.value)} placeholder="Carolina" />
              </div>
              <div className="form-group">
                <label>Código postal</label>
                <input value={addr.zip} onChange={e => setA('zip', e.target.value)} placeholder="00987" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cliente'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancelar</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
