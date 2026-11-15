-- Color de cada empleado en todos los calendarios de la app: el Calendario, el
-- calendario del Dashboard y Dispatch.
--
-- Antes no se guardaba: el Calendario lo sacaba de un hash del id sobre una
-- lista de 11 colores (dos personas podían quedar iguales) y Dispatch lo
-- sacaba del orden en la lista, con otra paleta (la misma persona salía de un
-- color distinto en cada pantalla). Ahora la oficina lo escoge en el
-- Calendario → "🎨 Colores", de una paleta fija (lib/techColors.js) donde la
-- letra blanca se lee bien en modo claro y oscuro.
--
-- null = no se ha escogido; la app sigue usando el color de antes (el del
-- hash), así que nada cambia para nadie hasta que alguien escoja uno.
--
-- El check solo exige formato #rrggbb; que sea de la paleta lo controla la app.
-- Tier: sin cambio. technicians no tiene RLS nueva; la oficina ya la actualiza
-- desde el Calendario (ics_token).
--
-- Safe to re-run.

alter table technicians add column if not exists color text;

alter table technicians drop constraint if exists technicians_color_format;
alter table technicians
  add constraint technicians_color_format
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
