
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { supabaseServer as supabase } from '../../../lib/supabase';
import Sidebar from '../../Sidebar';
import Link from 'next/link';
import RetencionesClient from './RetencionesClient';

export default async function RetencionesPage({ searchParams }) {
  const year = parseInt(searchParams?.year ?? new Date().getFullYear());

  const [{ data: retenciones }, { data: clients }] = await Promise.all([
    supabase.from('retenciones')
      .select('*, clients(name)')
      .gte('fecha', `${year}-01-01`)
      .lte('fecha', `${year}-12-31`)
      .order('fecha', { ascending: false }),
    supabase.from('clients').select('id, name').order('name'),
  ]);

  const rets = retenciones ?? [];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Per client summary
  const byClient = {};
  rets.forEach(r => {
    const key = r.client_id ?? 'sin-cliente';
    const name = r.clients?.name ?? 'Sin cliente';
    if (!byClient[key]) byClient[key] = { name, totalFacturado: 0, totalRetenido: 0, totalCalculado: 0, count: 0 };
    byClient[key].totalFacturado += Number(r.monto_facturado ?? 0);
    byClient[key].totalRetenido += Number(r.retencion_aplicada ?? 0);
    byClient[key].totalCalculado += Number(r.retencion_calculada ?? 0);
    byClient[key].count++;
  });

  const totalFacturado = rets.reduce((a, r) => a + Number(r.monto_facturado ?? 0), 0);
  const totalRetenido = rets.reduce((a, r) => a + Number(r.retencion_aplicada ?? 0), 0);
  const totalCalculado = rets.reduce((a, r) => a + Number(r.retencion_calculada ?? 0), 0);
  const totalDiferencia = totalCalculado - totalRetenido;

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <div className="page-title">Retenciones</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Servicios profesionales — Año {year}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/accounting" className="btn btn-ghost">← Dashboard</Link>
          </div>
        </div>

        {/* Year selector */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {years.map(y => (
              <Link key={y} href={`/accounting/retenciones?year=${y}`}
                className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
                {y}
              </Link>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total facturado</div>
            <div className="stat-value">${Number(totalFacturado).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Retención calculada (10%)</div>
            <div className="stat-value" style={{ color: 'var(--navy)' }}>${Number(totalCalculado).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Retención aplicada</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>${Number(totalRetenido).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Diferencia</div>
            <div className="stat-value" style={{ color: totalDiferencia > 0.01 ? 'var(--warn)' : 'var(--ok)' }}>
              ${Number(totalDiferencia).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Per client summary */}
        {Object.keys(byClient).length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 14 }}>Resumen por cliente</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Transacciones</th>
                    <th style={{ textAlign: 'right' }}>Total facturado</th>
                    <th style={{ textAlign: 'right' }}>Retención calculada</th>
                    <th style={{ textAlign: 'right' }}>Retención aplicada</th>
                    <th style={{ textAlign: 'right' }}>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(byClient).map((c, i) => {
                    const diff = c.totalCalculado - c.totalRetenido;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                        <td style={{ textAlign: 'right' }}>${c.totalFacturado.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: 'right' }}>${c.totalCalculado.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: 'right', color: 'var(--amber)' }}>${c.totalRetenido.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: diff > 0.01 ? 'var(--warn)' : 'var(--ok)' }}>
                          {diff > 0.01 ? '⚠️ ' : '✓ '}${diff.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Retenciones client component for add/edit */}
        <RetencionesClient retenciones={rets} clients={clients ?? []} year={year} />
      </main>
    </div>
  );
}
