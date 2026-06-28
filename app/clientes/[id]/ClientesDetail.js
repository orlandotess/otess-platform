'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const statusJob = {
  estimate: { cls: 'badge-gray', label: 'Estimado' },
  scheduled: { cls: 'badge-blue', label: 'Programado' },
  in_progress: { cls: 'badge-amber', label: 'En progreso' },
  completed: { cls: 'badge-green', label: 'Completado' },
  cancelled: { cls: 'badge-red', label: 'Cancelado' }
};
const statusInv = {
  draft: { cls: 'badge-gray', label: 'Borrador' },
  sent: { cls: 'badge-blue', label: 'Enviada' },
  paid: { cls: 'badge-green', label: 'Pagada' },
  overdue: { cls: 'badge-red', label: 'Vencida' }
};
const fmt = n => `$${Number(n ?? 0).toFixed(2)}`;

export default function ClientesDetail({ client, jobs, invoices, properties: initProps, contacts: initContacts }) {
  const router = useRouter();
  const [tab, setTab] = useState('info');
  const [properties, setProperties] = useState(initProps);
  const [contacts, setContacts] = useState(initContacts);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Property form
  const [showPropForm, setShowPropForm] = useState(false);
  const [prop, setProp] = useState({ name: '', street: '', city: '', state: 'PR', zip: '' });
  const [savingProp, setSavingProp] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '', property_id: '' });
  const [savingContact, setSavingContact] = useState(false);

  const [jobCount, setJobCount] = useState(0);

  async function handleDeleteClick() {
    const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('client_id', client.id);
    setJobCount(count ?? 0);
    setShowDelete(true);
  }

  async function deleteClient() {
    setDeleting(true);
    console.log('Deleting client:', client.id);
    const { data: clientJobs } = await supabase.from('jobs').select('id').eq('client_id', client.id);
    const jobIds = clientJobs?.map(j => j.id) ?? [];
    if (jobIds.length > 0) {
      await supabase.from('job_line_items').delete().in('job_id', jobIds);
      await supabase.from('job_notes').delete().in('job_id', jobIds);
      await supabase.from('job_checklist_items').delete().in('job_id', jobIds);
      await supabase.from('jobs').delete().eq('client_id', client.id);
    }
    await supabase.from('client_contacts').delete().eq('client_id', client.id);
    await supabase.from('client_properties').delete().eq('client_id', client.id);
    await supabase.from('clients').delete().eq('id', client.id);
    window.location.href = '/clientes';
  }

  async function saveProperty(e) {
    e.preventDefault();
    setSavingProp(true);
    const { data } = await supabase.from('client_properties').insert([{
      client_id: client.id,
      ...prop,
      is_primary: properties.length === 0,
    }]).select().single();
    if (data) {
      setProperties(prev => [...prev, data]);
      setProp({ name: '', street: '', city: '', state: 'PR', zip: '' });
      setShowPropForm(false);
    }
    setSavingProp(false);
  }

  async function deleteProperty(propId) {
    await supabase.from('client_properties').delete().eq('id', propId);
    setProperties(prev => prev.filter(p => p.id !== propId));
  }

  async function setPrimary(propId) {
    await supabase.from('client_properties').update({ is_primary: false }).eq('client_id', client.id);
    await supabase.from('client_properties').update({ is_primary: true }).eq('id', propId);
    setProperties(prev => prev.map(p => ({ ...p, is_primary: p.id === propId })));
  }

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    const { data } = await supabase.from('client_contacts').insert([{
      client_id: client.id,
      ...contact,
      property_id: contact.property_id || null,
      is_primary: contacts.length === 0,
    }]).select().single();
    if (data) setContacts(prev => [...prev, data]);
    setContact({ name: '', phone: '', email: '', property_id: '' });
    setShowContactForm(false);
    setSavingContact(false);
  }

  async function deleteContact(contactId) {
    await supabase.from('client_contacts').delete().eq('id', contactId);
    setContacts(prev => prev.filter(c => c.id !== contactId));
  }

  const tabStyle = t => ({
    padding: '10px 20px',
    fontWeight: tab === t ? 700 : 500,
    color: tab === t ? 'var(--navy)' : 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--navy)' : '2px solid transparent',
    fontSize: 14,
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', marginBottom: 20, background: '#fff', borderRadius: '12px 12px 0 0', padding: '0 8px' }}>
        <button style={tabStyle('info')} onClick={() => setTab('info')}>👤 Info</button>
        <button style={tabStyle('properties')} onClick={() => setTab('properties')}>
          📍 Propiedades
          {properties.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{properties.length}</span>}
        </button>
        <button style={tabStyle('contacts')} onClick={() => setTab('contacts')}>
          👥 Contactos
          {contacts.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{contacts.length}</span>}
        </button>
        <button style={tabStyle('jobs')} onClick={() => setTab('jobs')}>
          🔧 Trabajos
          {jobs.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{jobs.length}</span>}
        </button>
        <button style={tabStyle('invoices')} onClick={() => setTab('invoices')}>
          🧾 Facturas
          {invoices.length > 0 && <span style={{ background: 'var(--amber)', color: 'var(--navy)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{invoices.length}</span>}
        </button>
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Información de contacto</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Nombre', value: client.name },
                  { label: 'Empresa', value: client.company },
                  { label: 'Email', value: client.email },
                  { label: 'Teléfono', value: client.phone },
                ].map(f => f.value ? (
                  <div key={f.label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ fontSize: 14 }}>{f.value}</div>
                  </div>
                ) : null)}
              </div>
            </div>
            {client.notes && (
              <div className="card">
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 10 }}>Notas</p>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{client.notes}</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen</p>
              {[
                { label: 'Propiedades', value: properties.length },
                { label: 'Contactos', value: contacts.length },
                { label: 'Trabajos', value: jobs.length },
                { label: 'Facturas', value: invoices.length },
                { label: 'Total facturado', value: fmt(invoices.reduce((a, i) => a + Number(i.total ?? 0), 0)) },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#fca5a5', justifyContent: 'center' }} onClick={handleDeleteClick}>
              🗑 Eliminar cliente
            </button>
          </div>
        </div>
      )}

      {/* PROPERTIES TAB */}
      {tab === 'properties' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPropForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Propiedades ({properties.length})</h2>
              <button className="btn btn-primary" onClick={() => setShowPropForm(!showPropForm)}>
                {showPropForm ? 'Cancelar' : '+ Agregar propiedad'}
              </button>
            </div>
            {showPropForm && (
              <form onSubmit={saveProperty}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Nombre de la propiedad *</label>
                    <input value={prop.name} onChange={e => setProp(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Oficina Principal, Almacén Caguas" required />
                  </div>
                  <div className="form-group">
                    <label>Calle</label>
                    <input value={prop.street} onChange={e => setProp(p => ({ ...p, street: e.target.value }))} placeholder="Calle y número" />
                  </div>
                  <div className="form-group">
                    <label>Ciudad</label>
                    <input value={prop.city} onChange={e => setProp(p => ({ ...p, city: e.target.value }))} placeholder="San Juan" />
                  </div>
                  <div className="form-group">
                    <label>Estado</label>
                    <input value={prop.state} onChange={e => setProp(p => ({ ...p, state: e.target.value }))} placeholder="PR" />
                  </div>
                  <div className="form-group">
                    <label>Zip</label>
                    <input value={prop.zip} onChange={e => setProp(p => ({ ...p, zip: e.target.value }))} placeholder="00901" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingProp}>
                  {savingProp ? 'Guardando...' : '💾 Guardar propiedad'}
                </button>
              </form>
            )}
          </div>

          {properties.length === 0 ? (
            <div className="card empty"><p>No hay propiedades. Agrega la primera arriba.</p></div>
          ) : properties.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    {p.is_primary && <span className="badge badge-green">Principal</span>}
                  </div>
                  {p.street && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{p.street}</div>}
                  {p.city && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{p.city}, {p.state} {p.zip}</div>}
                  <div style={{ marginTop: 8 }}>
                    {contacts.filter(c => c.property_id === p.id).map(c => (
                      <div key={c.id} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                        <span>👤 {c.name}</span>
                        {c.phone && <span>📞 {c.phone}</span>}
                        {c.email && <span>✉️ {c.email}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!p.is_primary && (
                    <button onClick={() => setPrimary(p.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>
                      Marcar principal
                    </button>
                  )}
                  <Link href={`/clientes/${client.id}/propiedades/${p.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>
                    Ver →
                  </Link>
                  <button onClick={() => deleteProperty(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTACTS TAB */}
      {tab === 'contacts' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showContactForm ? 20 : 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Contactos ({contacts.length})</h2>
              <button className="btn btn-primary" onClick={() => setShowContactForm(!showContactForm)}>
                {showContactForm ? 'Cancelar' : '+ Agregar contacto'}
              </button>
            </div>
            {showContactForm && (
              <form onSubmit={saveContact}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Nombre *</label>
                    <input value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} placeholder="Nombre completo" required />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} placeholder="787-000-0000" />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} placeholder="contacto@email.com" />
                  </div>
                  {properties.length > 0 && (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Propiedad asociada</label>
                      <select value={contact.property_id} onChange={e => setContact(c => ({ ...c, property_id: e.target.value }))}>
                        <option value="">— Sin propiedad —</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingContact}>
                  {savingContact ? 'Guardando...' : '💾 Guardar contacto'}
                </button>
              </form>
            )}
          </div>

          {contacts.length === 0 ? (
            <div className="card empty"><p>No hay contactos. Agrega el primero arriba.</p></div>
          ) : contacts.map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    {c.is_primary && <span className="badge badge-green">Principal</span>}
                  </div>
                  {c.phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>📞 {c.phone}</div>}
                  {c.email && <div style={{ fontSize: 13, color: 'var(--muted)' }}>✉️ {c.email}</div>}
                  {c.property_id && (
                    <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
                      📍 {properties.find(p => p.id === c.property_id)?.name}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link href={`/clientes/${client.id}/contactos/${c.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>
                    Ver →
                  </Link>
                  <button onClick={() => deleteContact(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* JOBS TAB */}
      {tab === 'jobs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Trabajos</h2>
            <Link href={`/trabajos/nuevo?client=${client.id}`} className="btn btn-primary">+ Nuevo trabajo</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="empty"><p>No hay trabajos para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Título</th><th>Estado</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const b = statusJob[j.status] ?? statusJob.estimate;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600 }}>{j.title}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString('es-PR') : '—'}</td>
                        <td><Link href={`/trabajos/${j.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INVOICES TAB */}
      {tab === 'invoices' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Facturas</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="empty"><p>No hay facturas para este cliente.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Número</th><th>Estado</th><th>Total</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const b = statusInv[inv.status] ?? statusInv.draft;
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600 }}>{inv.invoice_number ?? '—'}</td>
                        <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                        <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(inv.created_at).toLocaleDateString('es-PR')}</td>
                        <td><Link href={`/facturas/${inv.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar cliente?</h2>
            {jobCount > 0 ? (
              <div style={{ background: '#fef3cd', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Este cliente tiene {jobCount} trabajo{jobCount > 1 ? 's' : ''} existente{jobCount > 1 ? 's' : ''}.</p>
                <p style={{ fontSize: 13, color: '#92400e' }}>Al eliminar el cliente se borrarán también todos sus trabajos, notas, fotos y checklists.</p>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción es permanente.</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={deleteClient} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: '#fdecea', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar todo'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
