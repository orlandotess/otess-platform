'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';

export default function TicketReports({ ticketId, clientContacts = [], reports: initialReports = [] }) {
  const [reportsList, setReportsList] = useState(initialReports);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [resolutionDate, setResolutionDate] = useState('');
  const [personnel, setPersonnel] = useState('');
  const [summary, setSummary] = useState('');
  const [observations, setObservations] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [saving, setSaving] = useState(false);

  const [showDelete, setShowDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [emailingId, setEmailingId] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState([]);
  const [emailCcExtra, setEmailCcExtra] = useState('');
  const [sending, setSending] = useState(false);

  function openNew() {
    setEditingId(null);
    setTitle('');
    setResolutionDate(new Date().toISOString().slice(0, 10));
    setPersonnel('');
    setSummary('');
    setObservations('');
    setRecommendations('');
    setPreparedBy('');
    setShowModal(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setTitle(r.title);
    setResolutionDate(r.resolution_date ?? '');
    setPersonnel(r.personnel ?? '');
    setSummary(r.summary ?? '');
    setObservations(r.observations ?? '');
    setRecommendations(r.recommendations ?? '');
    setPreparedBy(r.prepared_by ?? '');
    setShowModal(true);
  }

  async function saveReport() {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      resolution_date: resolutionDate || null,
      personnel: personnel.trim() || null,
      summary: summary.trim() || null,
      observations: observations.trim() || null,
      recommendations: recommendations.trim() || null,
      prepared_by: preparedBy.trim() || null,
    };
    const { data, error } = editingId
      ? await supabase.from('ticket_reports').update(payload).eq('id', editingId).select().single()
      : await supabase.from('ticket_reports').insert([{ ticket_id: ticketId, ...payload }]).select().single();
    setSaving(false);
    if (error) {
      alert('No se pudo guardar el reporte: ' + error.message);
      return;
    }
    if (editingId) {
      setReportsList(prev => prev.map(r => r.id === editingId ? data : r));
    } else {
      setReportsList(prev => [data, ...prev]);
    }
    setShowModal(false);
  }

  async function deleteReport(reportId) {
    setDeleting(true);
    await supabase.from('ticket_reports').delete().eq('id', reportId);
    setReportsList(prev => prev.filter(r => r.id !== reportId));
    setDeleting(false);
    setShowDelete(null);
  }

  function openEmail(report) {
    setEmailingId(report.id);
    setEmailTo(report.sent_to || '');
    setEmailCc(report.sent_cc ?? []);
    setEmailCcExtra('');
  }

  function toggleCcContact(email) {
    setEmailCc(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  }

  async function sendEmail(e) {
    e.preventDefault();
    setSending(true);
    const extraCc = emailCcExtra.split(',').map(s => s.trim()).filter(Boolean);
    const cc = [...new Set([...emailCc, ...extraCc])];
    const res = await fetch('/api/send-ticket-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: emailingId, toEmail: emailTo, cc }),
    });
    const data = await res.json();
    setSending(false);
    if (data.success) {
      setReportsList(prev => prev.map(r => r.id === emailingId ? { ...r, sent_at: new Date().toISOString(), sent_to: emailTo, sent_cc: cc.length ? cc : null } : r));
      setEmailingId(null);
    } else {
      alert('Error: ' + data.error);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Reportes</h2>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={openNew}>+ Nuevo reporte</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>
        Documenta lo que se hizo para resolver este boleto y compártelo con el cliente por email.
      </p>

      {reportsList.length === 0 ? (
        <div className="empty"><p>No hay reportes aún.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reportsList.map(r => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {r.resolution_date ? new Date(`${r.resolution_date}T00:00:00`).toLocaleDateString('es-PR') : '—'}
                    {r.sent_at && <span> · ✅ Enviado a {r.sent_to}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} href={`/reporte-boleto/${r.id}`} target="_blank" rel="noopener noreferrer">👁 Ver</a>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => openEdit(r)}>✏️ Editar</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => openEmail(r)}>📧 Enviar</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--warn)' }} onClick={() => setShowDelete(r.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 480, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 16 }}>{editingId ? 'Editar reporte' : 'Nuevo reporte'}</h2>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Título</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Resolución — cuadro telefónico" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fecha de resolución</label>
                <input type="date" value={resolutionDate} onChange={e => setResolutionDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Personal presente</label>
                <input value={personnel} onChange={e => setPersonnel(e.target.value)} placeholder="Nombres separados por coma" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Resumen de la resolución</label>
              <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4} placeholder="Describe lo que se hizo para resolver el problema..." />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Observaciones</label>
              <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} placeholder="Una observación por línea..." />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Recomendaciones</label>
              <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} rows={3} placeholder="Una recomendación por línea..." />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Preparado por</label>
              <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Nombre para la firma" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" disabled={saving || !title.trim()} onClick={saveReport} style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {emailingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 16 }}>Enviar reporte por email</h2>
            <form onSubmit={sendEmail}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Email del cliente</label>
                <input type="email" required value={emailTo} onChange={e => setEmailTo(e.target.value)} autoFocus />
              </div>

              {clientContacts.filter(c => c.email).length > 0 && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Copiar a (CC)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    {clientContacts.filter(c => c.email).map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={emailCc.includes(c.email)} onChange={() => toggleCcContact(c.email)} />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: 'var(--muted)' }}>{c.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Otros correos en copia (opcional)</label>
                <input value={emailCcExtra} onChange={e => setEmailCcExtra(e.target.value)} placeholder="correo1@ejemplo.com, correo2@ejemplo.com" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                  {sending ? 'Enviando...' : '📤 Enviar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEmailingId(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>¿Eliminar reporte?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => deleteReport(showDelete)} disabled={deleting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger-tint)', color: 'var(--warn)', border: 'none' }}>
                {deleting ? 'Eliminando...' : '🗑 Sí, eliminar'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDelete(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
