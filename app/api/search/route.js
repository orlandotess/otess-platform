import { supabaseServer } from '../../../lib/supabase';
import { getCurrentRole } from '../../../lib/supabase-server';

// Categorías buscables. `roles` refleja las mismas restricciones que
// TECNICO_ALLOWED/VENDEDOR_BLOCKED en proxy.js — un técnico solo ve
// clientes/trabajos/propiedades/contactos/boletos porque es lo único que
// puede abrir; nunca se le devuelven facturas/estimados/propuestas aunque
// coincidan con la búsqueda.
const CATEGORIES = [
  {
    key: 'clients', table: 'clients', label: 'Clientes', icon: 'users',
    roles: ['admin', 'secretaria', 'vendedor', 'tecnico'],
    select: 'id, name, company, email, phone',
    href: r => `/clientes/${r.id}`,
    title: r => r.name || 'Sin nombre',
    subtitle: r => r.company || r.phone || r.email || '',
  },
  {
    key: 'client_properties', table: 'client_properties', label: 'Propiedades', icon: 'map',
    roles: ['admin', 'secretaria', 'vendedor', 'tecnico'],
    select: 'id, name, street, city, client_id, clients(name)',
    href: r => `/clientes/${r.client_id}`,
    title: r => r.name || r.street || 'Propiedad',
    subtitle: r => [r.street, r.city].filter(Boolean).join(', ') || r.clients?.name || '',
  },
  {
    key: 'client_contacts', table: 'client_contacts', label: 'Contactos', icon: 'user',
    roles: ['admin', 'secretaria', 'vendedor', 'tecnico'],
    select: 'id, name, email, phone, client_id, clients(name)',
    href: r => `/clientes/${r.client_id}`,
    title: r => r.name || 'Contacto',
    subtitle: r => r.clients?.name || r.email || r.phone || '',
  },
  {
    key: 'jobs', table: 'jobs', numberCol: 'job_number', label: 'Trabajos', icon: 'bolt',
    roles: ['admin', 'secretaria', 'vendedor', 'tecnico'],
    select: 'id, job_number, title, status, client_id, clients(name)',
    href: r => `/trabajos/${r.id}`,
    title: r => [r.job_number, r.title].filter(Boolean).join(' · ') || 'Trabajo',
    subtitle: r => r.clients?.name || r.status || '',
  },
  {
    key: 'invoices', table: 'invoices', numberCol: 'invoice_number', label: 'Facturas', icon: 'receipt',
    roles: ['admin', 'secretaria', 'vendedor'],
    select: 'id, invoice_number, status, client_id, clients(name)',
    href: r => `/facturas/${r.id}`,
    title: r => `Factura ${r.invoice_number ?? ''}`.trim(),
    subtitle: r => r.clients?.name || r.status || '',
  },
  {
    key: 'estimates', table: 'estimates', numberCol: 'estimate_number', label: 'Estimados', icon: 'calculator',
    roles: ['admin', 'secretaria', 'vendedor'],
    select: 'id, estimate_number, title, status, client_id, clients(name)',
    href: r => `/estimados/${r.id}`,
    title: r => [r.estimate_number, r.title].filter(Boolean).join(' · ') || 'Estimado',
    subtitle: r => r.clients?.name || r.status || '',
  },
  {
    key: 'proposals', table: 'proposals', numberCol: 'proposal_number', label: 'Propuestas', icon: 'fileText',
    roles: ['admin', 'secretaria', 'vendedor'],
    select: 'id, proposal_number, title, status, client_id, clients(name)',
    href: r => `/propuestas/${r.id}`,
    title: r => [r.proposal_number, r.title].filter(Boolean).join(' · ') || 'Propuesta',
    subtitle: r => r.clients?.name || r.status || '',
  },
  {
    key: 'service_tickets', table: 'service_tickets', numberCol: 'ticket_number', label: 'Boletos', icon: 'ticket',
    roles: ['admin', 'secretaria', 'vendedor', 'tecnico'],
    select: 'id, ticket_number, subject, status, client_id, clients(name)',
    href: r => `/boletos/${r.id}`,
    title: r => [r.ticket_number, r.subject].filter(Boolean).join(' · ') || 'Boleto',
    subtitle: r => r.clients?.name || r.status || '',
  },
];

// Prefix tsquery ("mar tap" -> "mar:* & tap:*") para que coincida mientras el
// usuario sigue escribiendo, en vez de exigir la palabra completa.
function buildTsQuery(raw) {
  const cleaned = raw.replace(/[&|!():*'"<>]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return null;
  return words.map(w => `${w}:*`).join(' & ');
}

// El parser de Postgres lee "INV-1041" como "inv" + "-1041" (entero con
// signo), así que "1041:*" nunca coincide en search_vector. Para búsquedas con
// dígitos se busca además directo en la columna del número con ILIKE.
function buildNumberPattern(raw) {
  const cleaned = raw.trim().replace(/[%_\\]/g, '');
  if (!/\d/.test(cleaned) || cleaned.length > 30) return null;
  return `%${cleaned.replace(/\s+/g, '%')}%`;
}

export async function GET(request) {
  const role = await getCurrentRole();
  if (!role) return Response.json({ error: 'No autorizado' }, { status: 403 });

  const q = new URL(request.url).searchParams.get('q') || '';
  const tsQuery = buildTsQuery(q);
  if (!tsQuery) return Response.json({ results: [] });

  const categories = CATEGORIES.filter(c => c.roles.includes(role));

  const numberPattern = buildNumberPattern(q);

  const settled = await Promise.allSettled(
    categories.map(async cat => {
      const [byNumber, byText] = await Promise.all([
        cat.numberCol && numberPattern
          ? supabaseServer.from(cat.table).select(cat.select).ilike(cat.numberCol, numberPattern).limit(6)
          : { data: [] },
        supabaseServer
          .from(cat.table)
          .select(cat.select)
          .textSearch('search_vector', tsQuery, { config: 'spanish' })
          .limit(6),
      ]);
      if (byNumber.error && byText.error) throw byText.error;
      // Coincidencias por número primero; la exacta (p. ej. "1041" -> INV-1041)
      // antes que las parciales (INV-10410).
      const digits = q.replace(/\D/g, '');
      const numbered = (byNumber.data || []).sort((a, b) =>
        Number(!String(a[cat.numberCol]).endsWith(`-${digits}`)) - Number(!String(b[cat.numberCol]).endsWith(`-${digits}`))
      );
      const seen = new Set();
      return [...numbered, ...(byText.data || [])]
        .filter(row => !seen.has(row.id) && seen.add(row.id))
        .slice(0, 6);
    })
  );

  const results = settled.flatMap((res, i) => {
    const cat = categories[i];
    if (res.status !== 'fulfilled' || !res.value) return [];
    return res.value.map(row => ({
      type: cat.key,
      label: cat.label,
      icon: cat.icon,
      id: row.id,
      title: cat.title(row),
      subtitle: cat.subtitle(row),
      href: cat.href(row),
    }));
  });

  return Response.json({ results });
}
