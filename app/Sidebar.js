'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',          label: 'Dashboard',  icon: '⊞' },
  { href: '/clientes',  label: 'Clientes',   icon: '👥' },
  { href: '/trabajos',  label: 'Trabajos',   icon: '🔧' },
  { href: '/field',     label: 'Field App',  icon: '📱' },
];

export default function Sidebar() {
  const path = usePathname();

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
      <div style={{ padding: '16px 20px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
        app.otesspr.com
      </div>
    </aside>
  );
}
