'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function rowFor(payments, year, month) {
  return payments.find(p => p.year === year && p.month === month) ?? {
    year, month, paid: false, due_date: '', reminder_day: '',
  };
}

export default function IVUPaymentTracker({ year, payments: initial }) {
  const [payments, setPayments] = useState(initial);
  const [savingKey, setSavingKey] = useState(null);

  function get(month) { return rowFor(payments, year, month); }

  function setLocal(month, patch) {
    setPayments(prev => {
      const exists = prev.some(p => p.year === year && p.month === month);
      if (exists) return prev.map(p => p.year === year && p.month === month ? { ...p, ...patch } : p);
      return [...prev, { ...rowFor(prev, year, month), ...patch }];
    });
  }

  async function save(month, patch) {
    const key = `${year}-${month}`;
    setSavingKey(key);
    const row = { ...get(month), ...patch };
    await supabase.from('ivu_payments').upsert({
      year, month,
      paid: row.paid,
      due_date: row.due_date || null,
      reminder_day: row.reminder_day === '' ? null : parseInt(row.reminder_day),
      paid_at: row.paid && !row.paid_at ? new Date().toISOString() : (row.paid ? row.paid_at : null),
    }, { onConflict: 'year,month' });
    setSavingKey(null);
  }

  function togglePaid(month) {
    const next = !get(month).paid;
    setLocal(month, { paid: next });
    save(month, { paid: next });
  }

  return (
    <div className="card">
      <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>Pagos de IVU — {year}</p>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        Marca cada mes como pagado, define la fecha límite y el día en que quieres que te recordemos si sigue pendiente.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th style={{ textAlign: 'center' }}>Pagado</th>
              <th>Fecha límite</th>
              <th>Recordarme el día</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((label, m) => {
              const row = get(m);
              const key = `${year}-${m}`;
              return (
                <tr key={m}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!row.paid} onChange={() => togglePaid(m)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  </td>
                  <td>
                    <input type="date" value={row.due_date ?? ''} onChange={e => setLocal(m, { due_date: e.target.value })}
                      onBlur={() => save(m, {})} style={{ fontSize: 13, padding: '5px 8px', maxWidth: 160 }} />
                  </td>
                  <td>
                    <input type="number" min="1" max="28" value={row.reminder_day ?? ''} placeholder="día"
                      onChange={e => setLocal(m, { reminder_day: e.target.value })}
                      onBlur={() => save(m, {})} style={{ fontSize: 13, padding: '5px 8px', width: 70 }} />
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{savingKey === key ? 'Guardando...' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
