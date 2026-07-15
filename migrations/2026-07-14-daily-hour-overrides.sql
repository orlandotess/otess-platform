-- Per-day manual hour overrides for the admin Timesheet page, complementing the
-- existing weekly override (payroll_adjustments). Lets admin/secretaria set a
-- day's Regular/OT hours directly (e.g. tech forgot to clock in, or a
-- correction is needed) without having to fake clock-in/clock-out times in
-- time_entries. When present for a technician_id/work_date, this takes
-- precedence over the computed sum of that day's time_entries.
-- RLS: admin+secretaria only, matching payroll_adjustments/technicians writes
-- (see otess-rls-rollout-summary memory — /admin/timesheet is admin+secretaria-only).
--
-- Safe to re-run: uses IF NOT EXISTS / DROP+CREATE for policies.

create table if not exists daily_hour_overrides (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references technicians(id) on delete cascade,
  work_date date not null,
  regular_hours_override numeric not null default 0,
  overtime_hours_override numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technician_id, work_date)
);

alter table daily_hour_overrides enable row level security;

drop policy if exists daily_hour_overrides_select on daily_hour_overrides;
create policy daily_hour_overrides_select on daily_hour_overrides for select
  using (auth_role() in ('admin', 'secretaria'));
drop policy if exists daily_hour_overrides_insert on daily_hour_overrides;
create policy daily_hour_overrides_insert on daily_hour_overrides for insert
  with check (auth_role() in ('admin', 'secretaria'));
drop policy if exists daily_hour_overrides_update on daily_hour_overrides;
create policy daily_hour_overrides_update on daily_hour_overrides for update
  using (auth_role() in ('admin', 'secretaria'));
drop policy if exists daily_hour_overrides_delete on daily_hour_overrides;
create policy daily_hour_overrides_delete on daily_hour_overrides for delete
  using (auth_role() in ('admin', 'secretaria'));
