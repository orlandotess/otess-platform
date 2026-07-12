'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';

export default function PlanosListClient({ plans }) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visible = query
    ? plans.filter(p =>
        (p.name ?? '').toLowerCase().includes(query) ||
        (p.clients?.name ?? '').toLowerCase().includes(query) ||
        (p.jobs?.title ?? '').toLowerCase().includes(query))
    : plans;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar plano, cliente o trabajo..." />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>Sin resultados para "{search}".</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {visible.map(p => (
            <Link key={p.id} href={`/planos/${p.id}`} style={{
              display: 'block', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              overflow: 'hidden', textDecoration: 'none', color: 'inherit', background: 'var(--surface)',
            }}>
              <div style={{ aspectRatio: '4 / 3', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.thumbUrl
                  ? <img src={p.thumbUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 32, opacity: 0.4 }}>🗺️</span>}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {p.clients?.name ?? p.jobs?.title ?? 'Sin asignar'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
