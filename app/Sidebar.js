'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';

const operationsLinks = [
 { href: '/clientes',   label: 'Clientes',   icon: 'users' },
 { href: '/trabajos',   label: 'Trabajos',   icon: 'bolt' },
 { href: '/boletos',    label: 'Boletos',    icon: 'ticket' },
 { href: '/calendario', label: 'Calendario', icon: 'calendar' },
 { href: '/propuestas', label: 'Propuestas', icon: 'fileText' },
 { href: '/estimados', label: 'Estimados', icon: 'calculator' },
 { href: '/crew',       label: 'Crew App',   icon: 'phone' },
 { href: '/catalogo', label: 'Labor & Productos', icon: 'toolbox' },
 { href: '/planos',   label: 'Planos',   icon: 'map' },
];

const accountingLinks = [
 { href: '/accounting',               label: 'Dashboard',   icon: 'barChart' },
 { href: '/accounting/facturas',      label: 'Facturas',    icon: 'receipt' },
 { href: '/accounting/ivu',           label: 'IVU',         icon: 'bank' },
 { href: '/accounting/payroll',       label: 'Payroll',     icon: 'clock' },
 { href: '/accounting/rentabilidad',  label: 'Rentabilidad',icon: 'coins' },
 { href: '/accounting/retenciones',   label: 'Retenciones', icon: 'clipboard' },
 { href: '/accounting/cliente360',    label: 'Cliente 360', icon: 'compass' },
  { href: '/admin/timesheet', label: 'Timesheet', icon: 'clock' },
];

const adminLinks = [
 { href: '/admin/plantillas', label: 'Plantillas', icon: 'clipboard' },
 { href: '/admin/usuarios', label: 'Usuarios', icon: 'user' },
 { href: '/admin/empresa', label: 'Empresa', icon: 'building' },
 { href: '/admin/ausencias', label: 'Ausencias', icon: 'userOff' },
];

const sections = [
 { id: 'operations', label: 'Operaciones',   links: operationsLinks },
 { id: 'accounting', label: 'Contabilidad',  links: accountingLinks },
 { id: 'admin',      label: 'Administración',links: adminLinks },
];

// Extra sections that exist in the app but aren't primary sidebar links —
// still searchable so the sidebar search can reach the whole platform.
const extraSearchableLinks = [
 { href: '/facturas/recurrentes', label: 'Facturas · Recurrentes', icon: 'receipt' },
];

const searchableLinks = [
 { href: '/', label: 'Dashboard', icon: 'grid' },
 ...sections.flatMap(s => s.links.map(l => ({ ...l, label: `${s.label} · ${l.label}` }))),
 ...extraSearchableLinks,
];

const ICON_PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  users: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20 a 6 6 0 0 1 12 0"/><circle cx="17.5" cy="8.5" r="2.3"/><path d="M15.5 13.7 a 5.2 5.2 0 0 1 5.5 5.3"/></>,
  bolt: <path d="M13 2 L4 14 h6 l-1 8 l9 -13 h-6 z" fill="currentColor" stroke="none"/>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></>,
  fileText: <><rect x="6" y="3" width="12" height="18" rx="1.5"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></>,
  calculator: <><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><circle cx="8.5" cy="12" r="0.9"/><circle cx="12" cy="12" r="0.9"/><circle cx="15.5" cy="12" r="0.9"/><circle cx="8.5" cy="16" r="0.9"/><circle cx="12" cy="16" r="0.9"/><circle cx="15.5" cy="16" r="0.9"/></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10" y1="19" x2="14" y2="19"/></>,
  toolbox: <><rect x="8" y="4" width="8" height="5" rx="1"/><rect x="3" y="9" width="18" height="10" rx="2"/><line x1="3" y1="14" x2="21" y2="14"/></>,
  barChart: <><rect x="4" y="12" width="4" height="8" rx="0.5"/><rect x="10" y="6" width="4" height="14" rx="0.5"/><rect x="16" y="15" width="4" height="5" rx="0.5"/></>,
  receipt: <><path d="M6 3 h12 v18 l-2 -1.3 L14 21 l-2 -1.3 L10 21 l-2 -1.3 L6 21 z"/><line x1="8.5" y1="8" x2="15.5" y2="8"/><line x1="8.5" y1="12" x2="15.5" y2="12"/></>,
  bank: <><line x1="4" y1="21" x2="20" y2="21"/><line x1="5" y1="10" x2="5" y2="18"/><line x1="9" y1="10" x2="9" y2="18"/><line x1="15" y1="10" x2="15" y2="18"/><line x1="19" y1="10" x2="19" y2="18"/><path d="M3 10 L12 5 L21 10 z"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 v4.5 l3 2"/></>,
  coins: <><circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="15" r="5.5"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="13" y2="18"/></>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="M15 9 l-2 6 l-6 2 l2 -6 z"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20 a 7.5 7.5 0 0 1 15 0"/></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1"/><rect x="7" y="6" width="3" height="3"/><rect x="14" y="6" width="3" height="3"/><rect x="7" y="11" width="3" height="3"/><rect x="14" y="11" width="3" height="3"/><rect x="9.5" y="16" width="5" height="5"/></>,
  map: <><path d="M9 4 L3 6.5 v14 L9 18 l6 2.5 L21 18 V4 l-6 2.5 z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6.5" x2="15" y2="20.5"/></>,
  ticket: <><path d="M3 8 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v2.5 a2 2 0 0 0 0 3 V16 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 v-2.5 a2 2 0 0 0 0 -3 z"/><line x1="14" y1="7" x2="14" y2="17" strokeDasharray="2.5 2.5"/></>,
  userOff: <><circle cx="10" cy="8" r="3.2"/><path d="M4 20 a 6 6 0 0 1 12 0"/><line x1="3" y1="3" x2="21" y2="21"/></>,
};

function NavIcon({ name }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}

export default function Sidebar() {
 const path = usePathname();
 const router = useRouter();
 const [openSections, setOpenSections] = useState(() => {
   const state = {};
   for (const s of sections) {
     state[s.id] = s.id === 'operations' || s.links.some(l => path.startsWith(l.href));
   }
   return state;
 });
 const [search, setSearch] = useState('');
 const [hidden, setHidden] = useState(false);
 const [absenceCount, setAbsenceCount] = useState(0);
 const [darkMode, setDarkMode] = useState(false);

 useEffect(() => {
   setHidden(localStorage.getItem('sidebar-hidden') === '1');
   setDarkMode(localStorage.getItem('otess-theme') === 'dark');
 }, []);

 useEffect(() => {
   document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
 }, [darkMode]);

 function toggleDarkMode() {
   setDarkMode(d => {
     localStorage.setItem('otess-theme', d ? 'light' : 'dark');
     return !d;
   });
 }

 // Ausencias del mes en curso, para el badge junto al link en "Administración".
 // Se refresca al montar y cada vez que calendario-client.js dispara este evento tras crear/eliminar una ausencia.
 useEffect(() => {
   function fetchAbsenceCount() {
     const now = new Date();
     const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
     const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
     supabase.from('technician_absences').select('id', { count: 'exact', head: true })
       .gte('date', start).lte('date', end)
       .then(({ count }) => setAbsenceCount(count ?? 0));
   }
   fetchAbsenceCount();
   window.addEventListener('otess:absences-changed', fetchAbsenceCount);
   return () => window.removeEventListener('otess:absences-changed', fetchAbsenceCount);
 }, []);

 const badgeCounts = { '/admin/ausencias': absenceCount };

 useEffect(() => {
   document.body.classList.toggle('sidebar-hidden', hidden);
 }, [hidden]);

 useEffect(() => {
   document.body.classList.toggle('has-back-button', path !== '/');
 }, [path]);

 function toggleHidden() {
   setHidden(h => {
     localStorage.setItem('sidebar-hidden', h ? '0' : '1');
     return !h;
   });
 }

 function toggleSection(id) {
   setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
 }

 async function handleLogout() {
   await supabase.auth.signOut();
   router.push('/login');
   router.refresh();
 }

 function handleBack() {
   if (typeof window !== 'undefined' && window.history.length > 1) {
     router.back();
   } else {
     router.push('/');
   }
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
       <img src="/otess-logo-blanco.png" alt="OTESS" style={{ width: '100%', maxWidth: 160, height: 'auto', display: 'block' }} />
       <button
         onClick={toggleHidden}
         title="Ocultar sidebar"
         style={{ flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
       >
         «
       </button>
     </div>
     <div style={{ padding: '12px 16px 4px', position: 'relative' }}>
       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, pointerEvents: 'none' }}>
         <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
       </svg>
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
               <NavIcon name={l.icon} />
               {l.label}
               {badgeCounts[l.href] > 0 && (
                 <span style={{ marginLeft: 'auto', background: 'var(--warn)', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{badgeCounts[l.href]}</span>
               )}
             </Link>
           ))
         )
       ) : (
         <>
           <Link href="/" className={isActive('/') ? 'active' : ''}>
             <NavIcon name="grid" />
             Dashboard
           </Link>

           {sections.map(s => (
             <div key={s.id}>
               <button
                 onClick={() => toggleSection(s.id)}
                 className="sidebar-group-btn"
                 style={{ background: openSections[s.id] ? 'rgba(255,255,255,0.08)' : 'none' }}
               >
                 {s.label}
                 <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }}>{openSections[s.id] ? '▼' : '▶'}</span>
               </button>

               {openSections[s.id] && (
                 <div style={{ paddingLeft: 8 }}>
                   {s.links.map(l => (
                     <Link
                       key={l.href}
                       href={l.href}
                       className={isActive(l.href) ? 'active' : ''}
                       style={{ fontSize: 13 }}
                     >
                       <NavIcon name={l.icon} />
                       {l.label}
                       {badgeCounts[l.href] > 0 && (
                         <span style={{ marginLeft: 'auto', background: 'var(--warn)', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{badgeCounts[l.href]}</span>
                       )}
                     </Link>
                   ))}
                 </div>
               )}
             </div>
           ))}
         </>
       )}
     </nav>
     <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
       <button
         onClick={toggleDarkMode}
         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', width: '100%', fontSize: 13, fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
       >
         {darkMode ? (
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
         ) : (
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
         )}
         {darkMode ? 'Modo claro' : 'Modo oscuro'}
       </button>
       <button
         onClick={handleLogout}
         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', width: '100%', fontSize: 13, fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
       >
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
         Cerrar sesión
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
   {path !== '/' && (
     <button
       onClick={handleBack}
       title="Regresar"
       aria-label="Regresar"
       className="back-button"
     >
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
         <path d="M19 12H5" />
         <path d="M12 19l-7-7 7-7" />
       </svg>
     </button>
   )}
   </>
 );
}
