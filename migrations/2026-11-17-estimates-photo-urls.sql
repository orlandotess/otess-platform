-- Fotos escogidas de las notas de la solicitud al crear el estimado.
-- Rutas dentro del bucket Job-photos (igual que solicitud_notes.photo_urls);
-- las páginas del estimado las firman al mostrarlas. El cliente las ve.
alter table public.estimates
  add column if not exists photo_urls text[];
