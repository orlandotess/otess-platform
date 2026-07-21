-- Adds an optional single photo per checklist area, stored as a path in the
-- existing 'Job-photos' storage bucket (same bucket already used by
-- job_checklist_items, job_notes, expenses, etc.). Areas aren't rows anywhere
-- else in the schema -- they're just the group_name string shared by
-- job_checklist_items rows -- so this table gives an area a place to hang a
-- photo, keyed by (job_id, group_name). Restricted to named areas: the
-- ungrouped "General" bucket (group_name is null on job_checklist_items) is
-- already excluded from group-level actions in the UI (rename/delete/dup all
-- skip it in one surface or another), so it's excluded here too rather than
-- inventing a null-safe natural key for an edge case nothing else supports.
create table if not exists job_checklist_areas (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  group_name text not null,
  photo_url text,
  unique (job_id, group_name)
);

-- Lands RLS-enabled-with-zero-policies via trg_force_rls_on_new_tables; add
-- the same ALL4 tier (admin, secretaria, vendedor, tecnico) job_checklist_items
-- already has, since this table is edited from the same job checklist UI in
-- both the admin job page and the Crew App (see otess-rls-rollout-summary
-- memory for the tier matrix).
alter table job_checklist_areas enable row level security;

drop policy if exists job_checklist_areas_select on job_checklist_areas;
create policy job_checklist_areas_select on job_checklist_areas for select
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_checklist_areas_insert on job_checklist_areas;
create policy job_checklist_areas_insert on job_checklist_areas for insert
  with check (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_checklist_areas_update on job_checklist_areas;
create policy job_checklist_areas_update on job_checklist_areas for update
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
drop policy if exists job_checklist_areas_delete on job_checklist_areas;
create policy job_checklist_areas_delete on job_checklist_areas for delete
  using (auth_role() in ('admin', 'secretaria', 'vendedor', 'tecnico'));
