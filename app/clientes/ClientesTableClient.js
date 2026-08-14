'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { useTranslations } from 'next-intl';

export default function ClientesTableClient({ clients }) {
  const t = useTranslations('clientes.listTable');
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
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {visible.length === 0 ? (
        <div className="empty"><p>{t('noResults', { search })}</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('columns.name')}</th>
                <th>{t('columns.company')}</th>
                <th>{t('columns.type')}</th>
                <th>{t('columns.phone')}</th>
                <th>{t('columns.email')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}><Link href={`/clientes/${c.id}`} style={{ color: 'inherit' }}>{c.name}</Link></td>
                  <td style={{ color: 'var(--muted)' }}>{c.company ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.client_type === 'b2b' ? 'badge-blue' : 'badge-gray'}`}>
                      {c.client_type === 'b2b' ? t('type.b2b') : t('type.consumer')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
