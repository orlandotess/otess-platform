-- Permite convertir una Solicitud directamente en Estimado (además de en
-- Trabajo). Mismo patrón que converted_to_job_id (2026-07-15-solicitudes.sql):
-- la solicitud pasa a status 'convertida' y guarda a qué estimado dio origen.
--
-- Safe to re-run: IF NOT EXISTS.

alter table solicitudes add column if not exists converted_to_estimate_id uuid references estimates(id) on delete set null;
