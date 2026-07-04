'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';

export default function ClientesTableClient({ clients }) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visible = query
    ? clients.filter(c =>
        (c.name ?? '').toLowerCase().includes(query) ||
        (c.company ?? '').toLowerCase().includes(query) ||
        (c.email ?? '').toLowerCase().includes(query) ||
        (c.phone ?? '').toLowerCase().includes(query))
    : clients;

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente, empresa o contacto..." />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>Sin resultados para "{search}".</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.company ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>
                      {c.client_type === 'b2b' ? 'B2B' : 'Consumidor'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.email ?? '—'}</td>
                  <td><Link href={`/clientes/${c.id}`} style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 13 }}>Ver →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
