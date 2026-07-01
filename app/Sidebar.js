'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useState } from 'react';

const links = [
 { href: '/',           label: 'Dashboard',  icon: '⊞' },
 { href: '/clientes',   label: 'Clientes',   icon: '👥' },
 { href: '/trabajos',   label: 'Trabajos',   icon: '🔧' },
 { href: '/field',      label: 'Field App',  icon: '📱' },
 { href: '/admin/plantillas', label: 'Plantillas', icon: '📋' },
 { href: '/admin/usuarios', label: 'Usuarios', icon: '👤' },
 { href: '/catalogo', label: 'Labor & Productos', icon: '🧰' },
];

const accountingLinks = [
 { href: '/accounting',               label: 'Dashboard',   icon: '📊' },
 { href: '/accounting/facturas',      label: 'Facturas',    icon: '🧾' },
 { href: '/accounting/ivu',           label: 'IVU',         icon: '🏛' },
 { href: '/accounting/payroll',       label: 'Payroll',     icon: '⏱' },
 { href: '/accounting/retenciones',   label: 'Retenciones', icon: '📋' },
  { href: '/admin/timesheet', label: 'Timesheet', icon: '🕐' },
];

export default function Sidebar() {
 const path = usePathname();
 const router = useRouter();
 const [accountingOpen, setAccountingOpen] = useState(path.startsWith('/accounting') || path.startsWith('/horario'));

 async function handleLogout() {
   await supabase.auth.signOut();
   router.push('/login');
   router.refresh();
 }

 const isActive = (href) => {
   if (href === '/') return path === '/';
   if (href === '/accounting') return path === '/accounting';
   return path.startsWith(href);
 };

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
           className={isActive(l.href) ? 'active' : ''}
         >
           <span>{l.icon}</span>
           {l.label}
         </Link>
       ))}

        {/* Accounting group */}
       <button
         onClick={() => setAccountingOpen(!accountingOpen)}
         style={{
           display: 'flex', alignItems: 'center', gap: 10, width: '100%',
           padding: '10px 16px', background: accountingOpen ? 'rgba(255,255,255,0.08)' : 'none',
           border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
           fontSize: 14, fontWeight: 600, borderRadius: 8, textAlign: 'left',
         }}
       >
         <span>💰</span>
         Accounting
         <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }}>{accountingOpen ? '▼' : '▶'}</span>
       </button>

       {accountingOpen && (
         <div style={{ paddingLeft: 16 }}>
           {accountingLinks.map(l => (
             <Link
               key={l.href}
               href={l.href}
               className={isActive(l.href) ? 'active' : ''}
               style={{ fontSize: 13 }}
             >
               <span>{l.icon}</span>
               {l.label}
             </Link>
           ))}
         </div>
       )}
     </nav>
     <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
       <button
         onClick={handleLogout}
         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', width: '100%', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
       >
         🚪 Cerrar sesión
       </button>
     </div>
   </aside>
 );
}
