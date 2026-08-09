'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { formatDatePR } from '../../lib/datetimeLocal';
import ClientCombobox from '../facturas/nueva/ClientCombobox';

const TYPE_LABELS = {
  llamada: 'Llamada',
  visita: 'Visita/Reunión',
  cobro: 'Cobro',
  seguimiento: 'Seguimiento',
  recordatorio: 'Recordatorio',
  otro: 'Otro',
};

const URGENCY_STYLE = {
  amber: { bg: 'var(--amber-tint)', border: 'var(--amber)' },
  warn: { bg: 'var(--danger-tint)', border: 'var(--warn)' },
  neutral: { bg: 'var(--bg)', border: 'var(--border-strong)' },
};

// due_date es una columna `date` (sin hora/zona) — formatearla con formatDatePR
// la pasaría por America/Puerto_Rico y la correría un día hacia atrás, así
// que se arma el MM/DD/YYYY directo desde el string en vez de vía Date/UTC.
function formatPlainDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function gestionSubtitle(g) {
  const parts = [g.clients?.name, TYPE_LABELS[g.type] ?? g.type];
  if (g.due_date) parts.push(`vence ${formatPlainDate(g.due_date)}`);
  if (g.assigned_to_name) parts.push(`asignado a ${g.assigned_to_name}`);
  return parts.filter(Boolean).join(' · ');
}

function ActionRow({ title, subtitle, urgency, right }) {
  const style = URGENCY_STYLE[urgency] ?? URGENCY_STYLE.neutral;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: style.bg, borderLeft: `3px solid ${style.border}`, borderRadius: '0 8px 8px 0' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

const actionButtonStyle = { border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' };

const emptyForm = { title: '', type: 'otro', clientId: '', dueDate: '', assignedToId: '' };

export default function InboxWidget({ notifications: initial, automaticItems = [], gestiones: initialGestiones = [], officeProfiles = [], currentProfile = null }) {
  const [items, setItems] = useState(initial);
  const [gestiones, setGestiones] = useState(initialGestiones);
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [clients, setClients] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, assignedToId: currentProfile?.id ?? '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const unread = items.filter(n => !n.read).length;
  const pendingCount = automaticItems.length + gestiones.length;

  async function markRead(id) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('inbox_notifications').update({ read: true }).eq('id', id);
  }

  async function markAllRead() {
    const ids = items.filter(n => !n.read).map(n => n.id);
    if (ids.length === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('inbox_notifications').update({ read: true }).in('id', ids);
  }

  async function deleteNotification(id) {
    setItems(prev => prev.filter(n => n.id !== id));
    await supabase.from('inbox_notifications').delete().eq('id', id);
  }

  async function completeGestion(id) {
    setGestiones(prev => prev.filter(g => g.id !== id));
    await supabase.from('gestiones').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id);
  }

  function ensureClientsLoaded() {
    if (clients === null) {
      supabase.from('clients').select('id, name, company, client_type').order('name').then(({ data }) => setClients(data ?? []));
    }
  }

  function openForm() {
    ensureClientsLoaded();
    setEditingId(null);
    setForm({ ...emptyForm, assignedToId: currentProfile?.id ?? '' });
    setShowForm(true);
    setOpen(true);
  }

  function startEdit(g) {
    ensureClientsLoaded();
    setEditingId(g.id);
    setForm({
      title: g.title,
      type: g.type,
      clientId: g.client_id ?? '',
      dueDate: g.due_date ?? '',
      assignedToId: g.assigned_to_id ?? '',
    });
    setShowForm(true);
    setOpen(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submitGestion(e) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const assigned = officeProfiles.find(p => p.id === form.assignedToId);
    const client = (clients ?? []).find(c => c.id === form.clientId);
    const payload = {
      title: form.title.trim(),
      type: form.type,
      client_id: form.clientId || null,
      due_date: form.dueDate || null,
      assigned_to_id: form.assignedToId || null,
      assigned_to_name: assigned?.name ?? null,
    };

    if (editingId) {
      const { data, error } = await supabase.from('gestiones').update(payload).eq('id', editingId).select().single();
      setSaving(false);
      if (error) { alert('No se pudo guardar los cambios.'); return; }
      setGestiones(prev => prev.map(g => g.id === editingId ? { ...data, clients: client ? { name: client.name } : null } : g));
    } else {
      const { data, error } = await supabase.from('gestiones').insert([{
        ...payload,
        created_by_id: currentProfile?.id ?? null,
        created_by_name: currentProfile?.name ?? null,
      }]).select().single();
      setSaving(false);
      if (error) { alert('No se pudo guardar la gestión.'); return; }
      setGestiones(prev => [{ ...data, clients: client ? { name: client.name } : null }, ...prev]);
    }

    setForm({ ...emptyForm, assignedToId: currentProfile?.id ?? '' });
    setEditingId(null);
    setShowForm(false);
  }

  async function deleteGestion() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('gestiones').delete().eq('id', deleteTarget);
    setDeleting(false);
    if (error) { alert('No se pudo eliminar la gestión.'); return; }
    setGestiones(prev => prev.filter(g => g.id !== deleteTarget));
    setDeleteTarget(null);
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>Bandeja de entrada</span>
          {pendingCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--amber)', borderRadius: 10, padding: '1px 7px' }}>{pendingCount}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={openForm}>+ Nueva gestión</button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {showForm && (
            <form onSubmit={submitGestion} style={{ border: '1px dashed var(--border-strong)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{editingId ? 'Editar gestión' : 'Nueva gestión manual'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Título — ej. Llamar para seguimiento"
                  style={{ gridColumn: '1 / -1', fontSize: 13 }}
                />
                <div>
                  <ClientCombobox clients={clients ?? []} value={form.clientId} onChange={id => setForm(f => ({ ...f, clientId: id }))} />
                </div>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: 13 }}>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>Tipo: {label}</option>
                  ))}
                </select>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ fontSize: 13 }} />
                <select value={form.assignedToId} onChange={e => setForm(f => ({ ...f, assignedToId: e.target.value }))} style={{ fontSize: 13 }}>
                  <option value="">Sin asignar</option>
                  {officeProfiles.map(p => (
                    <option key={p.id} value={p.id}>Asignar a: {p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={cancelForm}>Cancelar</button>
                <button type="submit" className="btn btn-orange" style={{ fontSize: 12, padding: '6px 12px' }} disabled={saving}>
                  {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar gestión'}
                </button>
              </div>
            </form>
          )}

          {pendingCount > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Acción requerida</div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
                {gestiones.map(g => (
                  <ActionRow
                    key={g.id}
                    title={<>{g.title} <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 11 }}>· manual</span></>}
                    subtitle={gestionSubtitle(g)}
                    urgency={g.due_date && g.due_date < new Date().toISOString().slice(0, 10) ? 'warn' : 'neutral'}
                    right={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button style={{ ...actionButtonStyle, background: 'var(--ok)', color: '#fff' }} onClick={() => completeGestion(g.id)}>Completar</button>
                        <button
                          onClick={() => startEdit(g)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', padding: 4 }}
                          title="Editar gestión"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeleteTarget(g.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', padding: 4 }}
                          title="Eliminar gestión"
                        >
                          🗑
                        </button>
                      </div>
                    }
                  />
                ))}
                {automaticItems.map(it => (
                  <ActionRow
                    key={it.id}
                    title={it.title}
                    subtitle={it.subtitle}
                    urgency={it.urgency}
                    right={
                      <Link href={it.href} style={{ ...actionButtonStyle, background: it.urgency === 'warn' ? 'var(--warn)' : 'var(--navy)', color: '#fff', display: 'inline-block', textDecoration: 'none' }}>
                        {it.ctaLabel}
                      </Link>
                    }
                  />
                ))}
              </div>
            </>
          )}

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', color: 'var(--muted)', textTransform: 'uppercase' }}>Actividad reciente</div>
                {unread > 0 && (
                  <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={markAllRead}>Marcar todo leído</button>
                )}
              </div>
              <div style={{ display: 'grid' }}>
                {items.map(n => (
                  <div key={n.id} onClick={() => !n.read && markRead(n.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: n.read ? 'default' : 'pointer' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', marginTop: 5, flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: n.read ? 'var(--muted)' : 'var(--navy)' }}>{n.title}</div>
                        {n.body && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{n.body}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDatePR(n.created_at, { month: 'short', day: 'numeric' })}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {n.link && <Link href={n.link} onClick={e => e.stopPropagation()} style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 600 }}>Ver →</Link>}
                        <button
                          onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar esta notificación?')) deleteNotification(n.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', padding: 0 }}
                          title="Eliminar notificación"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {pendingCount === 0 && items.length === 0 && !showForm && (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Todo al día — no hay pendientes.</p>
          )}
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar gestión?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={deleteGestion} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : 'OK'}
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
