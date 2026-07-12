'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

const EVENT_COLORS = {
  job: 'var(--info)',
  visit: '#16a085',
  event: 'var(--navy)',
  task: '#8e44ad',
  absence: 'var(--warn)',
  invoice_issued: 'var(--navy)',
  invoice_due: 'var(--orange)',
  payment: 'var(--ok)',
  retencion: '#8e44ad',
};
const EVENT_LABELS = {
  job: 'Trabajo programado',
  visit: 'Visita',
  event: 'Evento',
  task: 'Tarea',
  absence: 'Ausencia de técnico',
  invoice_issued: 'Factura emitida',
  invoice_due: 'Factura vence',
  payment: 'Pago recibido',
  retencion: 'Retención registrada',
};

const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AccountingCalendarClient({ year, month, jobs, visits, calendarEvents, tasks, absences, invoicesIssued, invoicesDue, payments, retenciones }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const monthName = new Date(year, month, 1).toLocaleString('es-PR', { month: 'long' });
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const calendarHref = `/calendario?view=month&year=${year}&month=${month}`;

  const eventsByDate = useMemo(() => {
    const map = {};
    const add = (date, ev) => {
      if (!date) return;
      const d = date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    };
    jobs.forEach(j => add(j.scheduled_start, { type: 'job', label: j.title, href: `/trabajos/${j.id}`, sub: j.clients?.name }));
    visits.forEach(v => add(v.scheduled_at, { type: 'visit', label: v.requests?.title ?? 'Visita', href: `/solicitudes/${v.request_id}`, sub: v.requests?.clients?.name }));
    calendarEvents.forEach(e => add(e.start_at, { type: 'event', label: e.title, href: calendarHref, sub: e.clients?.name }));
    tasks.forEach(t => add(t.due_at, { type: 'task', label: t.title, href: calendarHref, sub: t.clients?.name }));
    absences.forEach(a => add(a.date, { type: 'absence', label: `${a.technicians?.name ?? 'Técnico'} ausente`, href: '/admin/ausencias' }));
    invoicesIssued.forEach(i => add(i.issued_at, { type: 'invoice_issued', label: i.invoice_number, href: `/facturas/${i.id}`, sub: i.clients?.name }));
    invoicesDue.forEach(i => add(i.due_at, { type: 'invoice_due', label: i.invoice_number, href: `/facturas/${i.id}`, sub: i.clients?.name }));
    payments.forEach(p => add(p.paid_at, { type: 'payment', label: fmt(p.amount), href: `/facturas/${p.invoice_id}`, sub: p.invoices?.invoice_number }));
    retenciones.forEach(r => add(r.fecha, { type: 'retencion', label: fmt(r.retencion_aplicada), href: '/accounting/retenciones?tab=cliente', sub: r.clients?.name }));
    return map;
  }, [jobs, visits, calendarEvents, tasks, absences, invoicesIssued, invoicesDue, payments, retenciones, calendarHref]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false, date: null });
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    cells.push({ day: i, current: true, date: dateStr });
  }
  const remaining = (cells.length <= 35 ? 35 : 42) - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ day: i, current: false, date: null });

  const prevMonth = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const nextMonth = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>📅 Calendario — {monthLabel} {year}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link href={`/accounting?cyear=${prevMonth.y}&cmonth=${prevMonth.m}`} className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }}>← Anterior</Link>
          <Link href="/accounting" className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }}>Hoy</Link>
          <Link href={`/accounting?cyear=${nextMonth.y}&cmonth=${nextMonth.m}`} className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }}>Siguiente →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {cells.map((cell, idx) => {
              const dayEvents = cell.date ? (eventsByDate[cell.date] ?? []) : [];
              const isToday = cell.date === today;
              const isSelected = cell.date === selectedDate;
              const uniqueTypes = [...new Set(dayEvents.map(e => e.type))];
              return (
                <button key={idx} type="button" onClick={() => cell.date && setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                  style={{ minHeight: 54, height: 54, padding: '4px 6px', borderRadius: 8, textAlign: 'left', cursor: cell.date ? 'pointer' : 'default',
                    background: isSelected ? '#e8eeff' : isToday ? '#f0f4ff' : 'var(--surface)',
                    border: isSelected ? '2px solid var(--amber)' : isToday ? '2px solid var(--navy)' : '1px solid var(--border)',
                    opacity: cell.current ? 1 : 0.4, display: 'block', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: cell.current ? 'var(--text)' : 'var(--muted)' }}>{cell.day}</div>
                  {dayEvents.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                      {uniqueTypes.slice(0, 4).map(t => (
                        <div key={t} style={{ width: 6, height: 6, borderRadius: '50%', background: EVENT_COLORS[t] }} />
                      ))}
                      {dayEvents.length > 4 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>+{dayEvents.length - 4}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {Object.entries(EVENT_LABELS).map(([type, label]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: EVENT_COLORS[type] }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-PR', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Selecciona un día'}
          </div>
          {!selectedDate ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Haz clic en un día para ver sus eventos.</div>
          ) : selectedEvents.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Sin eventos ese día.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedEvents.map((ev, i) => (
                <Link key={i} href={ev.href} style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: EVENT_COLORS[ev.type], marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{EVENT_LABELS[ev.type]}{ev.sub ? ` · ${ev.sub}` : ''}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
