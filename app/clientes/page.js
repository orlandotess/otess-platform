import { supabase } from '../../lib/supabase';
import Sidebar from '../Sidebar';
import Link from 'next/link';

export default async function ClientesPage() {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, client_type, email, phone, company')
    .order('name');

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div className="page-title">Clientes</div>
          <Link href="/clientes/nuevo" className="btn btn-primary">+ Nuevo cliente</Link>
        </div>
        <div className="card">
          {!clients?.length ? (
            <div className="empty">
              <p>No hay clientes aún. <Link href="/clientes/nuevo" style={{ color: 'var(--amber)' }}>Agregar el primero →</Link></p>
            </div>
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
                  {clients.map(c => (
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
      </main>
    </div>
  );
}
