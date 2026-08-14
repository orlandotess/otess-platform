'use client';
import { useState } from 'react';
import MantenimientoForm from './MantenimientoForm';
import MantenimientoActions from './MantenimientoActions';
import { useTranslations, useLocale } from 'next-intl';

const DOW_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function cadenceLabel(r, t) {
  const dowLabels = DOW_KEYS.map(k => t(`dow.${k}`));
  const freqLabels = { weekly: t('frequency.weekly'), monthly: t('frequency.monthly'), quarterly: t('frequency.quarterly'), yearly: t('frequency.yearly') };
  return r.frequency === 'weekly'
    ? t('cadenceWeekly', { day: dowLabels[r.day_of_week] ?? '' })
    : t('cadenceOther', { freq: freqLabels[r.frequency] ?? r.frequency, day: r.day_of_month });
}

function technicianNames(r, t) {
  const names = [r.technicians?.name, ...(r.recurring_maintenance_technicians ?? []).map(rmt => rmt.technicians?.name)].filter(Boolean);
  return names.length ? names.join(', ') : t('noTechniciansAssigned');
}

export default function MantenimientosClient({ recurring: initial, technicians, clients, clientProperties }) {
  const t = useTranslations('mantenimientos.listClient');
  const locale = useLocale();
  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-PR', { month: 'short', day: 'numeric', year: 'numeric' });

  function handleSaved(row) {
    setRows(prev => {
      const exists = prev.some(r => r.id === row.id);
      return exists ? prev.map(r => r.id === row.id ? row : r) : [row, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  }

  function handleToggled(updated) {
    setRows(prev => prev.map(r => r.id === updated.id ? { ...r, active: updated.active } : r));
  }

  function handleDeleted(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(r) {
    setEditing(r);
    setShowForm(false);
  }

  const formOpen = showForm || editing;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        {!formOpen && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ {t('newMaintenance')}</button>
        )}
      </div>

      {formOpen && (
        <MantenimientoForm
          editing={editing}
          technicians={technicians}
          clients={clients}
          clientProperties={clientProperties}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: rows.length === 0 ? undefined : 0 }}>
        {rows.length === 0 ? (
          <div className="empty"><p>{t('empty')}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('table.number')}</th>
                  <th>{t('table.client')}</th>
                  <th>{t('table.title')}</th>
                  <th>{t('table.technicians')}</th>
                  <th>{t('table.frequency')}</th>
                  <th>{t('table.nextVisit')}</th>
                  <th>{t('table.checklist')}</th>
                  <th>{t('table.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{r.maintenance_number ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.clients?.name ?? '—'}</td>
                    <td>{r.title}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{technicianNames(r, t)}</td>
                    <td style={{ fontSize: 13 }}>{cadenceLabel(r, t)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(r.next_run_date)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{t('itemCount', { count: (r.recurring_maintenance_items ?? []).length })}</td>
                    <td><span className="badge" style={{ color: r.active ? 'var(--ok)' : 'var(--ink-faint)' }}>{r.active ? t('active') : t('paused')}</span></td>
                    <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✏️</button>
                      <MantenimientoActions id={r.id} active={r.active} onToggled={handleToggled} onDeleted={handleDeleted} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
