'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';

const links = [
 { href: '/clientes',   label: 'Clientes',   icon: '👥' },
 { href: '/trabajos',   label: 'Trabajos',   icon: '🔧' },
 { href: '/propuestas', label: 'Propuestas', icon: '📄' },
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
 { href: '/accounting/cliente360',    label: 'Cliente 360', icon: '🧭' },
  { href: '/admin/timesheet', label: 'Timesheet', icon: '🕐' },
];

// Extra sections that exist in the app but aren't primary sidebar links —
// still searchable so the sidebar search can reach the whole platform.
const extraSearchableLinks = [
 { href: '/calendario', label: 'Calendario', icon: '📅' },
 { href: '/facturas/recurrentes', label: 'Facturas · Recurrentes', icon: '🔁' },
];

const searchableLinks = [
 { href: '/', label: 'Dashboard', icon: '⊞' },
 ...links,
 ...accountingLinks.map(l => ({ ...l, label: `Accounting · ${l.label}` })),
 ...extraSearchableLinks,
];

export default function Sidebar() {
 const path = usePathname();
 const router = useRouter();
 const [accountingOpen, setAccountingOpen] = useState(path.startsWith('/accounting') || path.startsWith('/horario'));
 const [search, setSearch] = useState('');
 const [hidden, setHidden] = useState(false);

 useEffect(() => {
   setHidden(localStorage.getItem('sidebar-hidden') === '1');
 }, []);

 useEffect(() => {
   document.body.classList.toggle('sidebar-hidden', hidden);
 }, [hidden]);

 function toggleHidden() {
   setHidden(h => {
     localStorage.setItem('sidebar-hidden', h ? '0' : '1');
     return !h;
   });
 }

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

 const query = search.trim().toLowerCase();
 const searchResults = query
   ? searchableLinks.filter(l => l.label.toLowerCase().includes(query))
   : null;

 return (
   <>
   <aside className="sidebar">
     <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
       <img src="/otess-logo.png" alt="OTESS" style={{ width: '100%', maxWidth: 160, height: 'auto', display: 'block' }} />
       <button
         onClick={toggleHidden}
         title="Ocultar sidebar"
         style={{ flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
       >
         «
       </button>
     </div>
     <div style={{ padding: '12px 16px 4px', position: 'relative' }}>
       <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
       <input
         value={search}
         onChange={e => setSearch(e.target.value)}
         placeholder="Buscar..."
         style={{
           width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, fontSize: 13,
           border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)',
           color: '#fff', outline: 'none',
         }}
       />
     </div>
     <nav className="sidebar-nav">
       {searchResults ? (
         searchResults.length === 0 ? (
           <p style={{ padding: '10px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Sin resultados.</p>
         ) : (
           searchResults.map(l => (
             <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>
               <span>{l.icon}</span>
               {l.label}
             </Link>
           ))
         )
       ) : (
         <>
           <Link href="/" className={isActive('/') ? 'active' : ''}>
             <span>⊞</span>
             Dashboard
           </Link>

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
         </>
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
   <button
     onClick={toggleHidden}
     title="Mostrar sidebar"
     className="sidebar-show-btn"
   >
     ☰
   </button>
   </>
 );
}
