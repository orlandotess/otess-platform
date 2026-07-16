-- Módulo "Solicitudes": etapa previa a Trabajo, inspirada en Jobber Requests
-- (ver jobber_requests_mapping.md). Un cliente pide un servicio, opcionalmente
-- se agenda una evaluación en sitio, y el equipo la convierte en Trabajo
-- cuando está lista para cotizar/ejecutar. No tiene RLS, igual que jobs/
-- job_line_items/job_notes — el acceso se controla en middleware.js por rol.

create table if not exists solicitudes (
  id uuid primary key default gen_random_uuid(),
  solicitud_number text unique,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'nueva'
    check (status in ('nueva','necesita_aprobacion','evaluacion_completa','convertida','archivada')),
  salesperson text default 'Orlando Tapia',
  requested_on timestamptz not null default now(),

  -- Evaluación en sitio (opcional, activada con un toggle en el formulario)
  assessment_date timestamptz,
  assessment_instructions text,
  assessment_completed boolean not null default false,

  -- Propiedad (denormalizado, igual que jobs)
  property_id uuid references client_properties(id) on delete set null,
  property_name text,
  street text,
  city text,
  state text default 'PR',
  zip text,

  -- Contacto (denormalizado, igual que jobs)
  contact_id uuid references client_contacts(id) on delete set null,
  contact_name text,
  contact_phone text,
  contact_email text,

  notes text,
  photo_urls text[],

  converted_to_job_id uuid references jobs(id) on delete set null,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solicitudes_client_id_idx on solicitudes(client_id);
create index if not exists solicitudes_status_idx on solicitudes(status);

create table if not exists solicitud_line_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  type text not null default 'labor' check (type in ('labor','product')),
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  msrp numeric,
  supplier_price numeric,
  exempt_reason text,
  area text,
  vendor text,
  photo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists solicitud_line_items_solicitud_id_idx on solicitud_line_items(solicitud_id);

create table if not exists solicitud_notes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  note text,
  photo_url text,
  photo_urls text[],
  created_at timestamptz not null default now()
);

create index if not exists solicitud_notes_solicitud_id_idx on solicitud_notes(solicitud_id);
