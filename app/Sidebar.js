'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

const links = [
  { href: '/',           label: 'Dashboard',  icon: '⊞' },
  { href: '/clientes',   label: 'Clientes',   icon: '👥' },
  { href: '/trabajos',   label: 'Trabajos',   icon: '🔧' },
  { href: '/facturas',   label: 'Facturas',   icon: '🧾' },
  { href: '/horario',    label: 'Horario',    icon: '⏱' },
  { href: '/field',      label: 'Field App',  icon: '📱' },
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👤' },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>OTESS</h1>
        <p>OT Electrical & Security</p>
      </div>
      <nav className="sidebar-nav">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={path === l.href || (l.href !== '/' && path.startsWith(l.href)) ? 'active' : ''}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', width: '100%', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
        >
          🚪 Cerrar sesión
        </button>
      </div>
      <div style={{ padding: '8px 20px 16px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
        app.otesspr.com
      </div>
    </aside>
  );
}
