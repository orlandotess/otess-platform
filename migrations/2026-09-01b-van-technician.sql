-- Asignar un técnico a una van: con esto el Crew App puede abrir el tab
-- Inventario ya parado en la van de quien está usando la app, en vez de
-- obligarlo a buscarla a mano en una lista con TODAS las ubicaciones del
-- sistema (hoy la elección solo vive en localStorage, ver app/crew/page.js).
--
-- Deliberadamente NO restringe nada: el técnico sigue viendo y ajustando el
-- inventario global igual que antes — su van es solo el punto de partida.
-- Por eso no hace falta tocar RLS: locations_select_all4 (2026-07-18c) ya le
-- da SELECT sobre la tabla completa, columnas nuevas incluidas, y la escritura
-- sigue siendo OFFICE3 vía locations_all_office3 (solo oficina asigna).
--
-- Una columna y no una tabla de unión porque hoy cada van tiene un técnico
-- principal. Si más adelante una cuadrilla comparte van, esto se convierte en
-- junction sin perder los datos ya asignados.
--
-- La columna vive en locations (no solo en las de type='van') porque el check
-- de type ya existe en la tabla y agregar una restricción por tipo obligaría a
-- un constraint aparte sin ganar nada: la UI solo la ofrece en vans.
--
-- Safe to re-run: usa if not exists.

alter table locations add column if not exists technician_id uuid null references technicians(id) on delete set null;

create index if not exists locations_technician_id_idx on locations(technician_id);
