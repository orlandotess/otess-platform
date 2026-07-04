'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const roleLabel = { admin: 'Admin', tecnico: 'Técnico', vendedor: 'Vendedor', secretaria: 'Secretaría' };
const roleBadge = { admin: 'badge-blue', tecnico: 'badge-amber', vendedor: 'badge-green', secretaria: 'badge-gray' };

export default function UsersClient({ profiles, currentRole }) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'tecnico', password: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [passwordUser, setPasswordUser] = useState(null); // { id, name } or null
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const canChangeRole = currentRole !== 'secretaria';

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
      setSuccess(data.warning ? `Usuario ${invite.email} creado — ⚠️ ${data.warning}` : `Usuario ${invite.email} creado correctamente`);
      setShowInvite(false);
      setInvite({ email: '', name: '', role: 'tecnico', password: '' });
      router.refresh();
    }
    setSending(false);
  }

  async function toggleActive(profileId, currentActive) {
    await supabase.from('profiles').update({ active: !currentActive }).eq('id', profileId);
    router.refresh();
  }

  async function changeRole(profileId, newRole, profileName) {
    if (!canChangeRole) return;
    await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);

    // Promoting someone to técnico must also give them a technicians row,
    // or they silently can't be assigned to jobs or show up in payroll.
    if (newRole === 'tecnico') {
      const { data: existing, error: lookupError } = await supabase.from('technicians').select('id').ilike('name', profileName).maybeSingle();
      if (!lookupError && !existing) {
        const slug = profileName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
        const { error: techError } = await supabase.from('technicians').insert([{ name: profileName, username: slug || profileId.slice(0, 8) }]);
        if (techError) {
          setSuccess(`⚠️ Rol cambiado, pero no se pudo crear el registro de técnico: ${techError.message}`);
        } else {
          setSuccess(`✓ ${profileName} ahora es técnico y ya puede asignarse a trabajos.`);
        }
      }
    }
    router.refresh();
  }

  async function deleteUser(profileId, name) {
    if (!confirm(`¿Eliminar usuario "${name}"? Esta acción es permanente.`)) return;
    const res = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profileId }),
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    router.refresh();
  }

  async function savePassword(e) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError('');
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: passwordUser.id, password: newPassword }),
    });
    const data = await res.json();
    if (data.error) {
      setPasswordError(data.error);
    } else {
      setSuccess(`Contraseña actualizada para ${passwordUser.name}`);
      setPasswordUser(null);
      setNewPassword('');
    }
    setSavingPassword(false);
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
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Crear usuario</button>
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
                    {canChangeRole ? (
                      <select
                        value={p.role}
                        onChange={e => changeRole(p.id, e.target.value, p.name)}
                        style={{ padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                      >
                        {Object.entries(roleLabel).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${roleBadge[p.role]}`}>{roleLabel[p.role]}</span>
                    )}
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '5px 10px' }}
                        onClick={() => { setPasswordUser({ id: p.id, name: p.name }); setNewPassword(''); setPasswordError(''); }}
                      >
                        🔑 Contraseña
                      </button>
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

      {/* Create user modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 20 }}>Crear usuario</h2>
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
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Contraseña</label>
                <input type="text" value={invite.password} onChange={e => setInvite(i => ({ ...i, password: e.target.value }))} placeholder="Mínimo 6 caracteres" required minLength={6} />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label>Rol</label>
                <select value={invite.role} onChange={e => setInvite(i => ({ ...i, role: e.target.value }))}>
                  {Object.entries(roleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                  {sending ? 'Creando...' : '✅ Crear usuario'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowInvite(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {passwordUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>Cambiar contraseña</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Usuario: <strong>{passwordUser.name}</strong></p>
            <form onSubmit={savePassword}>
              {passwordError && <div style={{ background: '#fdecea', color: '#b52a2a', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{passwordError}</div>}
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label>Nueva contraseña</label>
                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={savingPassword} style={{ flex: 1, justifyContent: 'center' }}>
                  {savingPassword ? 'Guardando...' : '💾 Guardar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordUser(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
