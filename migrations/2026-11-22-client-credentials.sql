-- Credenciales por cliente (NVR, cámaras, wifi, alarmas, routers, portones…).
--
-- Antes las contraseñas se escribían en notas del cliente como texto normal.
-- Ahora cada credencial es una fila de client_credentials y la contraseña se
-- guarda CIFRADA en Supabase Vault (vault.secrets); la tabla solo guarda el id
-- del secreto (secret_id), nunca la contraseña.
--
-- Acceso — todo pasa por funciones (RPC) SECURITY DEFINER; la tabla tiene RLS
-- activo y ninguna política, así que el navegador no la puede leer directo:
--   admin, secretaria  → ven, crean, editan y borran credenciales de cualquier cliente.
--   tecnico            → ve, crea y edita credenciales de los clientes que tienen
--                        un trabajo (no cancelado) asignado a él: jobs.technician_id,
--                        job_technicians o job_schedule_days. No puede borrar.
--   vendedor / otros   → sin acceso.
--
-- La contraseña real solo sale con reveal_client_credential(), que deja un
-- registro en client_credential_views (quién, cuándo, desde qué trabajo). El
-- registro lo ven admin y secretaria.
--
-- Safe to re-run: IF NOT EXISTS, CREATE OR REPLACE y DROP ... IF EXISTS.

create extension if not exists supabase_vault;

create table if not exists client_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  property_id uuid references client_properties(id) on delete set null,
  kind text not null default 'otro'
    check (kind in ('nvr', 'camara', 'wifi', 'alarma', 'router', 'porton', 'otro')),
  label text not null check (length(trim(label)) > 0),
  username text,
  host text,
  notes text,
  secret_id uuid,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists client_credentials_client_idx on client_credentials (client_id);

create table if not exists client_credential_views (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references client_credentials(id) on delete cascade,
  viewer_email text,
  viewer_name text,
  job_id uuid references jobs(id) on delete set null,
  viewed_at timestamptz not null default now()
);

create index if not exists client_credential_views_cred_idx on client_credential_views (credential_id, viewed_at desc);

alter table client_credentials enable row level security;
alter table client_credential_views enable row level security;
-- Sin políticas: solo las funciones de abajo (y la service role) llegan a estas tablas.
revoke all on client_credentials from anon, authenticated;
revoke all on client_credential_views from anon, authenticated;

-- ¿El usuario actual puede ver/editar las credenciales de este cliente?
create or replace function public.can_access_client_credentials(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_role() in ('admin', 'secretaria') then true
    when auth_role() = 'tecnico' then exists (
      select 1
      from technicians t
      join profiles p on p.id = t.profile_id
      join jobs j on j.client_id = p_client_id and j.status <> 'cancelled'
      where p.email = auth.email()
        and (
          j.technician_id = t.id
          or exists (select 1 from job_technicians jt where jt.job_id = j.id and jt.technician_id = t.id)
          or exists (select 1 from job_schedule_days sd where sd.job_id = j.id and sd.technician_id = t.id)
        )
    )
    else false
  end
$$;

-- Lista de credenciales de un cliente, SIN contraseñas.
create or replace function public.list_client_credentials(p_client_id uuid)
returns table (
  id uuid, client_id uuid, property_id uuid, kind text, label text,
  username text, host text, notes text, has_secret boolean,
  updated_at timestamptz, updated_by text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not can_access_client_credentials(p_client_id) then
    raise exception 'sin acceso a las credenciales de este cliente' using errcode = '42501';
  end if;
  return query
    select c.id, c.client_id, c.property_id, c.kind, c.label,
           c.username, c.host, c.notes, c.secret_id is not null,
           c.updated_at, c.updated_by
    from client_credentials c
    where c.client_id = p_client_id
    order by c.kind, lower(c.label);
end;
$$;

-- Devuelve la contraseña y deja registro de quién la vio.
create or replace function public.reveal_client_credential(p_id uuid, p_job_id uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cred client_credentials%rowtype;
  v_secret text;
begin
  select * into v_cred from client_credentials where id = p_id;
  if not found or not can_access_client_credentials(v_cred.client_id) then
    raise exception 'sin acceso a esta credencial' using errcode = '42501';
  end if;
  if v_cred.secret_id is null then
    return null;
  end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.id = v_cred.secret_id;
  insert into client_credential_views (credential_id, viewer_email, viewer_name, job_id)
  values (
    p_id,
    auth.email(),
    (select name from profiles where email = auth.email() limit 1),
    case when exists (select 1 from jobs where id = p_job_id and client_id = v_cred.client_id) then p_job_id end
  );
  return v_secret;
end;
$$;

-- Crea (p_id null) o edita una credencial. p_secret null al editar = no cambiar
-- la contraseña; '' = quitarla.
create or replace function public.save_client_credential(
  p_id uuid,
  p_client_id uuid,
  p_property_id uuid,
  p_kind text,
  p_label text,
  p_username text,
  p_host text,
  p_notes text,
  p_secret text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cred client_credentials%rowtype;
  v_id uuid;
  v_secret_id uuid;
  v_who text := (select coalesce(name, auth.email()) from profiles where email = auth.email() limit 1);
begin
  if p_property_id is not null and not exists (
    select 1 from client_properties where id = p_property_id and client_id = p_client_id
  ) then
    raise exception 'la propiedad no es de este cliente';
  end if;

  if p_id is null then
    if not can_access_client_credentials(p_client_id) then
      raise exception 'sin acceso a las credenciales de este cliente' using errcode = '42501';
    end if;
    if p_secret is not null and p_secret <> '' then
      v_secret_id := vault.create_secret(p_secret, null, 'client_credentials');
    end if;
    insert into client_credentials (client_id, property_id, kind, label, username, host, notes, secret_id, created_by, updated_by)
    values (p_client_id, p_property_id, coalesce(nullif(p_kind, ''), 'otro'), trim(p_label),
            nullif(trim(p_username), ''), nullif(trim(p_host), ''), nullif(trim(p_notes), ''),
            v_secret_id, v_who, v_who)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_cred from client_credentials where id = p_id;
  if not found or v_cred.client_id <> p_client_id or not can_access_client_credentials(v_cred.client_id) then
    raise exception 'sin acceso a esta credencial' using errcode = '42501';
  end if;

  v_secret_id := v_cred.secret_id;
  if p_secret is not null then
    if p_secret = '' then
      if v_secret_id is not null then
        delete from vault.secrets where id = v_secret_id;
      end if;
      v_secret_id := null;
    elsif v_secret_id is null then
      v_secret_id := vault.create_secret(p_secret, null, 'client_credentials');
    else
      perform vault.update_secret(v_secret_id, p_secret);
    end if;
  end if;

  update client_credentials set
    property_id = p_property_id,
    kind = coalesce(nullif(p_kind, ''), 'otro'),
    label = trim(p_label),
    username = nullif(trim(p_username), ''),
    host = nullif(trim(p_host), ''),
    notes = nullif(trim(p_notes), ''),
    secret_id = v_secret_id,
    updated_at = now(),
    updated_by = v_who
  where id = p_id;
  return p_id;
end;
$$;

-- Borrar: solo la oficina. También borra la contraseña cifrada del Vault.
create or replace function public.delete_client_credential(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  if auth_role() not in ('admin', 'secretaria') then
    raise exception 'solo la oficina puede borrar credenciales' using errcode = '42501';
  end if;
  delete from client_credentials where id = p_id returning secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

-- Registro de accesos de un cliente (solo oficina).
create or replace function public.list_client_credential_views(p_client_id uuid)
returns table (
  id uuid, credential_id uuid, credential_label text,
  viewer_name text, viewer_email text, job_id uuid, job_number text, viewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('admin', 'secretaria') then
    raise exception 'solo la oficina puede ver el registro' using errcode = '42501';
  end if;
  return query
    select v.id, v.credential_id, c.label, v.viewer_name, v.viewer_email,
           v.job_id, j.job_number::text, v.viewed_at
    from client_credential_views v
    join client_credentials c on c.id = v.credential_id
    left join jobs j on j.id = v.job_id
    where c.client_id = p_client_id
    order by v.viewed_at desc
    limit 200;
end;
$$;

-- Si se borra el cliente, la cascada borra las filas; esto limpia sus secretos del Vault.
create or replace function public.client_credentials_cleanup_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists client_credentials_cleanup_secret on client_credentials;
create trigger client_credentials_cleanup_secret
  after delete on client_credentials
  for each row execute function public.client_credentials_cleanup_secret();

revoke all on function public.can_access_client_credentials(uuid) from public, anon;
revoke all on function public.list_client_credentials(uuid) from public, anon;
revoke all on function public.reveal_client_credential(uuid, uuid) from public, anon;
revoke all on function public.save_client_credential(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.delete_client_credential(uuid) from public, anon;
revoke all on function public.list_client_credential_views(uuid) from public, anon;
revoke all on function public.client_credentials_cleanup_secret() from public, anon, authenticated;

grant execute on function public.can_access_client_credentials(uuid) to authenticated;
grant execute on function public.list_client_credentials(uuid) to authenticated;
grant execute on function public.reveal_client_credential(uuid, uuid) to authenticated;
grant execute on function public.save_client_credential(uuid, uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_client_credential(uuid) to authenticated;
grant execute on function public.list_client_credential_views(uuid) to authenticated;
