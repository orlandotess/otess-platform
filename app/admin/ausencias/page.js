export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Anchored to Puerto Rico's fixed UTC-4 offset via UTC methods (matches
// admin/timesheet, accounting/payroll, and the Dashboard) so "today" — and
// therefore the default week/month/year shown — doesn't roll over up to 4
// hours early relative to PR time depending on the server's own timezone.
// start/end are then real UTC instants anchored to PR-calendar-day
// midnight, so every place that reads them back (below, and the label
// further down) must use UTC getters too, not local ones.
function getRange(period, offset) {
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  if (period === 'week') {
    const day = now.getUTCDay();
    const diffToMon = (day + 6) % 7;
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - diffToMon + offset * 7);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start, end };
  }
  if (period === 'year') {
    const year = now.getUTCFullYear() + offset;
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
  }
  // month
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { start: base, end: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)) };
}

export default async function AusenciasPage({ searchParams }) {
  const period = ['week', 'month', 'year'].includes(searchParams?.period) ? searchParams.period : 'month';
  const offset = parseInt(searchParams?.offset ?? '0');
  const techFilter = searchParams?.tech ?? 'all';

  const { start, end } = getRange(period, offset);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const [{ data: technicians }, { data: absencesRaw }] = await Promise.all([
    supabase.from('technicians').select('id, name').order('name'),
    supabase.from('technician_absences')
      .select('id, technician_id, date, reason, technicians(name)')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date'),
  ]);

  const techs = technicians ?? [];
  const absences = (absencesRaw ?? []).filter(a => techFilter === 'all' || a.technician_id === techFilter);

  const byTech = techs
    .filter(t => techFilter === 'all' || t.id === techFilter)
    .map(t => ({ ...t, absences: absences.filter(a => a.technician_id === t.id) }))
    .sort((a, b) => b.absences.length - a.absences.length);

  const totalAbsences = absences.length;
  const topTech = byTech.find(t => t.absences.length > 0);

  const fmtDay = d => new Date(`${d}T00:00:00`).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' });

  const label = period === 'week'
    ? `${start.toLocaleDateString('es-PR', { month: 'short', day: 'numeric', timeZone: 'UTC' })} — ${end.toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
    : period === 'year' ? String(start.getUTCFullYear())
    : `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;

  const qs = (over = {}) => {
    const p = { period, offset: String(offset), tech: techFilter, ...over };
    return `?period=${p.period}&offset=${p.offset}&tech=${p.tech}`;
  };

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Historial de ausencias</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{label}</p>
          </div>
          <Link href="/calendario" className="btn btn-ghost">← Calendario</Link>
        </div>

        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Periodo</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['week', 'Semana'], ['month', 'Mes'], ['year', 'Año']].map(([p, l]) => (
                <Link key={p} href={qs({ period: p, offset: '0' })} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>{l}</Link>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Rango</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link href={qs({ offset: String(offset - 1) })} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>← Anterior</Link>
              {offset !== 0 && <Link href={qs({ offset: '0' })} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Actual</Link>}
              {offset < 0 && <Link href={qs({ offset: String(offset + 1) })} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Siguiente →</Link>}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Técnico</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Link href={qs({ tech: 'all' })} className={`btn ${techFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>Todos</Link>
              {techs.map(t => (
                <Link key={t.id} href={qs({ tech: t.id })} className={`btn ${techFilter === t.id ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>{t.name}</Link>
              ))}
            </div>
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total ausencias</div>
            <div className="stat-value">{totalAbsences}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Técnicos con ausencias</div>
            <div className="stat-value">{byTech.filter(t => t.absences.length > 0).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Más ausencias</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{topTech ? `${topTech.name} (${topTech.absences.length})` : '—'}</div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th style={{ textAlign: 'right' }}>Total ausencias</th>
                  <th>Fechas y razón</th>
                </tr>
              </thead>
              <tbody>
                {byTech.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-red" style={{ visibility: t.absences.length ? 'visible' : 'hidden' }}>{t.absences.length}</span>
                      {!t.absences.length && '0'}
                    </td>
                    <td>
                      {t.absences.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {t.absences.map(a => (
                          <span key={a.id} title={a.reason || 'Sin razón especificada'}
                            style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--danger-tint)', color: 'var(--warn)', whiteSpace: 'nowrap' }}>
                            {fmtDay(a.date)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {byTech.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>No hay técnicos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
