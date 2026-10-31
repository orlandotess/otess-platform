-- PROPUESTA — no correr hasta que Orlando apruebe el diseño.
--
-- Solicitud → Estimado. Enlaza cada estimado con la solicitud de la que
-- salió, igual que estimates.job_id lo enlaza con un trabajo. El botón
-- "Crear estimado" de /solicitudes/[id] abre /estimados/nueva?solicitud=<id>
-- (mismo patrón que ?job=<id>), y al guardar se escribe este campo.
--
-- Candado: una solicitud tiene a lo sumo UN estimado activo. Un estimado
-- cancelado o archivado libera la solicitud para hacer otro. Si alguien
-- guarda el mismo estimado desde dos pestañas, el segundo insert falla con
-- 23505 y la app lleva al que ya existe. Los estimados viejos (sin
-- solicitud_id) no se tocan.
--
-- Tier: no cambia RLS. solicitudes sigue OFFICE3; el estimado público
-- (/estimado/[id]) no lee esta columna.
--
-- Safe to re-run: IF NOT EXISTS en columna e índices.

alter table estimates add column if not exists solicitud_id uuid references solicitudes(id) on delete set null;

create unique index if not exists estimates_solicitud_id_activo_key
  on estimates(solicitud_id)
  where archived_at is null and status <> 'cancelled';
