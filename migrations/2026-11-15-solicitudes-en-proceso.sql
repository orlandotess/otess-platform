-- Solicitudes: estado nuevo "en_proceso" (En proceso).
--
-- Va entre 'nueva' y 'necesita_aprobacion': alguien ya está atendiendo la
-- solicitud (se contactó al cliente, la visita está en curso). La app la trata
-- como abierta igual que 'nueva' y 'necesita_aprobacion' (filtros Vencidas y
-- Sin agendar, conteo del Dashboard), y al marcar la evaluación como hecha pasa
-- sola a 'evaluacion_completa', igual que desde 'nueva'.
--
-- La regla original es un CHECK en línea de 2026-07-15-solicitudes.sql, así que
-- Postgres le puso nombre solo (normalmente solicitudes_status_check). Para no
-- depender de ese nombre, se busca y se quita cualquier CHECK de la tabla que
-- mencione la columna status, y se crea uno con nombre fijo.
--
-- Tier: no cambia acceso (la tabla sigue igual). Las filas existentes cumplen la
-- regla nueva: solo se añade un valor permitido.
--
-- Safe to re-run.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'solicitudes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table solicitudes drop constraint %I', c.conname);
  end loop;
end $$;

alter table solicitudes
  add constraint solicitudes_status_check
  check (status in ('nueva', 'en_proceso', 'necesita_aprobacion', 'evaluacion_completa', 'convertida', 'archivada'));
