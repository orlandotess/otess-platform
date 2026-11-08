'use client';
import { useState } from 'react';
import Link from 'next/link';
import SearchBox from '../SearchBox';
import { useTranslations } from 'next-intl';

// Las filas llegan con el estado ya traducido y los totales por opción ya
// formateados desde page.js; aquí solo se filtra.
export default function PropuestasListClient({ proposals }) {
  const t = useTranslations('propuestas.list');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visible = query
    ? proposals.filter(p =>
        (p.proposal_number ?? '').toLowerCase().includes(query) ||
        (p.title ?? '').toLowerCase().includes(query) ||
        (p.clientName ?? '').toLowerCase().includes(query) ||
        (p.statusLabel ?? '').toLowerCase().includes(query))
    : proposals;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>
      {visible.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          {t('noResults', { search })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {visible.map((p, i) => (
            <Link key={p.id} href={`/propuestas/${p.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none', color: 'inherit' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                  {p.proposal_number} · {p.clientName ?? t('noClient')}
                </div>
                {p.totalsText && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{p.totalsText}</div>
                )}
              </div>
              <span className={`badge ${p.statusCls}`}>{p.statusLabel}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
