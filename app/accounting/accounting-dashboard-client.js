'use client';
import { useState } from 'react';

const QUARTERS = [
  { key: 'Q1', label: 'Q1', months: 'Ene — Mar' },
  { key: 'Q2', label: 'Q2', months: 'Abr — Jun' },
  { key: 'Q3', label: 'Q3', months: 'Jul — Sep' },
  { key: 'Q4', label: 'Q4', months: 'Oct — Dic' },
];

export default function AccountingDashboardClient({ quarterData, year }) {
  const [selected, setSelected] = useState(['Q1', 'Q2', 'Q3', 'Q4']);

  const fmt = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtH = h => `${Number(h).toFixed(1)}h`;

  function toggle(key) {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  const selectedData = quarterData.filter(q => selected.includes(q.key));

  const combined = selectedData.reduce((acc, q) => ({
    total: acc.total + q.revenue.total,
    collected: acc.collected + q.revenue.collected,
    outstanding: acc.outstanding + q.revenue.outstanding,
    subProducts: acc.subProducts + q.revenue.subProducts,
    subLabor: acc.subLabor + q.revenue.subLabor,
    taxProducts: acc.taxProducts + q.revenue.taxProducts,
    taxLabor: acc.taxLabor + q.revenue.taxLabor,
    payroll: acc.payroll + q.payroll,
    gastos: acc.gastos + (q.gastos ?? 0),
    ivuTotal: acc.ivuTotal + q.ivu.ivuTotal,
    ivuEstatal: acc.ivuEstatal + q.ivu.ivuEstatal,
    ivuMunicipal: acc.ivuMunicipal + q.ivu.ivuMunicipal,
    ivuB2B: acc.ivuB2B + q.ivu.ivuLaborB2B,
    ivuProducts: acc.ivuProducts + q.ivu.ivuProducts,
    count: acc.count + q.revenue.count,
  }), { total: 0, collected: 0, outstanding: 0, subProducts: 0, subLabor: 0, taxProducts: 0, taxLabor: 0, payroll: 0, gastos: 0, ivuTotal: 0, ivuEstatal: 0, ivuMunicipal: 0, ivuB2B: 0, ivuProducts: 0, count: 0 });

  const netEst = combined.collected - combined.payroll - combined.ivuTotal - combined.gastos;

  return (
    <div>
      {/* Quarter selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>📆 Trimestres — {year}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSelected(['Q1','Q2','Q3','Q4'])}>Todos</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSelected([])}>Ninguno</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {QUARTERS.map(q => (
            <button key={q.key} onClick={() => toggle(q.key)}
              style={{
                flex: 1, padding: '14px 10px', borderRadius: 12, border: '2px solid',
                borderColor: selected.includes(q.key) ? 'var(--navy)' : 'var(--border)',
                background: selected.includes(q.key) ? 'var(--navy)' : '#fff',
                color: selected.includes(q.key) ? '#fff' : 'var(--muted)',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{q.label}</div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{q.months}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: selected.includes(q.key) ? 'var(--amber)' : 'var(--navy)' }}>
                {fmt(quarterData.find(d => d.key === q.key)?.revenue.total ?? 0)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Combined summary */}
      {selected.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--amber)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>
              {selected.length === 4 ? '📆 Año completo' : `📊 ${selected.join(' + ')} combinado`}
            </h2>
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{combined.count} facturas</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'Facturado', value: combined.total, color: 'var(--navy)' },
              { label: 'Cobrado', value: combined.collected, color: 'var(--ok)' },
              { label: 'Pendiente', value: combined.outstanding, color: 'var(--amber)' },
              { label: 'Nómina', value: combined.payroll, color: '#e05c2a' },
              { label: 'Gastos', value: combined.gastos, color: '#b52a2a' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16, padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {[
              { label: 'Sub. Productos', value: combined.subProducts },
              { label: 'Sub. Labor', value: combined.subLabor },
              { label: 'IVU Productos', value: combined.taxProducts },
              { label: 'IVU Labor', value: combined.taxLabor },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', marginBottom: 10 }}>Desglose IVU</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                { label: 'IVU Total', value: combined.ivuTotal, bold: true },
                { label: 'Estatal (10.5%)', value: combined.ivuEstatal },
                { label: 'Municipal (1%)', value: combined.ivuMunicipal },
                { label: 'B2B Labor (4%)', value: combined.ivuB2B },
                { label: 'Productos (11.5%)', value: combined.ivuProducts },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 15, fontWeight: item.bold ? 800 : 700, color: item.bold ? 'var(--navy)' : 'inherit' }}>{fmt(item.value)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: netEst >= 0 ? 'var(--ok)' : 'var(--warn)', background: netEst >= 0 ? '#e6f4ee' : '#fdecea', padding: '6px 14px', borderRadius: 8 }}>
              Ganancia neta estimada: {fmt(netEst)}
            </div>
          </div>
        </div>
      )}

      {/* Individual quarter cards */}
      {selected.length > 1 && selectedData.map(q => {
        const netQ = q.revenue.collected - q.payroll - q.ivu.ivuTotal - (q.gastos ?? 0);
        return (
          <div key={q.key} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>
                {q.key} — {QUARTERS.find(x => x.key === q.key)?.months}
              </h3>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{q.revenue.count} facturas</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Facturado', value: q.revenue.total, color: 'var(--navy)' },
                { label: 'Cobrado', value: q.revenue.collected, color: 'var(--ok)' },
                { label: 'Pendiente', value: q.revenue.outstanding, color: 'var(--amber)' },
                { label: 'Nómina', value: q.payroll, color: '#e05c2a' },
                { label: 'Gastos', value: q.gastos ?? 0, color: '#b52a2a' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
              {[
                { label: 'IVU Total', value: q.ivu.ivuTotal },
                { label: 'Estatal', value: q.ivu.ivuEstatal },
                { label: 'Municipal', value: q.ivu.ivuMunicipal },
                { label: 'B2B (4%)', value: q.ivu.ivuLaborB2B },
                { label: 'Productos', value: q.ivu.ivuProducts },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(item.value)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: netQ >= 0 ? 'var(--ok)' : 'var(--warn)', background: netQ >= 0 ? '#e6f4ee' : '#fdecea', padding: '4px 10px', borderRadius: 6 }}>
                Ganancia neta: {fmt(netQ)}
              </span>
            </div>
          </div>
        );
      })}

      {selected.length === 0 && (
        <div className="card empty"><p>Selecciona al menos un quarter para ver los datos.</p></div>
      )}
    </div>
  );
}
