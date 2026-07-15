-- Orders module (Compras) — tracks purchase orders sent to vendors, generated
-- from approved Propuestas or Trabajos. Unblocks "Order Parts", the deferred
-- item from the Propuestas Portal.io-parity audit. See plan-modulo-orders.md
-- for the decisions behind this. Run in the Supabase SQL editor.

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  vendor_id uuid not null references vendors(id),
  status text not null default 'pendiente' check (status in ('pendiente', 'ordenado', 'recibido', 'cancelado')),
  source_type text not null check (source_type in ('proposal', 'job')),
  source_id uuid not null,
  source_label text not null,
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  description text not null,
  quantity numeric not null,
  unit_price numeric,
  source_line_item_id uuid,
  created_at timestamptz not null default now()
);

-- OFFICE3 tier (admin/secretaria/vendedor) — same as proposals and its child
-- tables, since this exposes supplier cost. Tecnico is excluded by
-- middleware.js's default-deny (/compras isn't in TECNICO_ALLOWED); these
-- policies are the backstop against direct anon-key access, same pattern as
-- company_settings_rls. Reuses the existing auth_role() helper.
create policy "vendors_office3_select" on vendors for select using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "vendors_office3_insert" on vendors for insert with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "vendors_office3_update" on vendors for update using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "vendors_office3_delete" on vendors for delete using (auth_role() in ('admin', 'secretaria', 'vendedor'));

create policy "purchase_orders_office3_select" on purchase_orders for select using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_orders_office3_insert" on purchase_orders for insert with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_orders_office3_update" on purchase_orders for update using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_orders_office3_delete" on purchase_orders for delete using (auth_role() in ('admin', 'secretaria', 'vendedor'));

create policy "purchase_order_items_office3_select" on purchase_order_items for select using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_order_items_office3_insert" on purchase_order_items for insert with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_order_items_office3_update" on purchase_order_items for update using (auth_role() in ('admin', 'secretaria', 'vendedor'));
create policy "purchase_order_items_office3_delete" on purchase_order_items for delete using (auth_role() in ('admin', 'secretaria', 'vendedor'));
