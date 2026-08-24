-- Allows more than one photo per job_checklist_items row. photo_url (added
-- in 2026-07-20b-checklist-item-photo.sql) is kept as the first-photo
-- convenience column — same pattern already used by job_notes/solicitud_notes
-- (photo_url + photo_urls) — so existing reads of photo_url keep working.
alter table job_checklist_items add column if not exists photo_urls text[];

-- No RLS change needed, same reasoning as the original photo_url column.
