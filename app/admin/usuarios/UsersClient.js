'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const roleLabel = { admin: 'Admin', tecnico: 'Técnico', vendedor: 'Vendedor', secretaria: 'Secretaría' };
const roleBadge = { admin: 'badge-blue', tecnico: 'badge-amber', vendedor: 'badge-green', secretaria: 'badge-gray' };

export default function UsersClient({ profiles }) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'tecnico' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function sendInvite(e) {
    e.preventDefault();
    setSending(true);
    setError('');

    const res = await fetch('/api/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invite),
    });
    const data = await res.json();

    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(`Invitación enviada a ${invite.email}`);
      setShowInvite(false);
      setInvite({ email: '', name: '', role: 'tecnico' });
      router.refresh();
    }
    setSending(false);
  }

  async function toggleActive(profileId, currentActive) {
    await supabase.from('profiles').update({ active: !currentActive }).eq('id', profileId);
    router.refresh();
  }

  async function changeRole(profileId, newRole) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    router.refresh();
  }

  async function deleteUser(profileId, name) {
    if (!confirm(`¿Eliminar usuario "${name}"? Esta acción es permanente.`)) return;
    await supabase.from('profiles').delete().eq('id', profileId);
    router.refresh();
  }

  return (
    <div>
      {success && (
        <div style={{ background: '#e6f4ee', color: '#1a7a4a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
          ✅ {success}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Usuarios del sistema</h2>
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invitar usuario</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.email}</td>
                  <td>
                    <select
                      value={p.role}
                      onChange={e => changeRole(p.id, e.target.value)}
                      style={{ padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                    >
                      {Object.entries(roleLabel).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-green' : 'badge-red'}`}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {new Date(p.created_at).toLocaleDateString('es-PR')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '5px 10px', color: p.active ? 'var(--warn)' : 'var(--ok)' }}
                        onClick={() => toggleActive(p.id, p.active)}
                      >
                        {p.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '5px 10px', color: 'var(--warn)' }}
                        onClick={() => deleteUser(p.id, p.name)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Invitar usuario</h2>
            <form onSubmit={sendInvite}>
              {error && <div style={{ background: '#fdecea', color: '#b52a2a', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Nombre completo</label>
                <input value={invite.name} onChange={e => setInvite(i => ({ ...i, name: e.target.value }))} placeholder="Juan García" required />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Email</label>
                <input type="email" value={invite.email} onChange={e => setInvite(i => ({ ...i, email: e.target.value }))} placeholder="juan@email.com" required />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label>Rol</label>
                <select value={invite.role} onChange={e => setInvite(i => ({ ...i, role: e.target.value }))}>
                  {Object.entries(roleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                  {sending ? 'Enviando...' : '📧 Enviar invitación'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowInvite(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
