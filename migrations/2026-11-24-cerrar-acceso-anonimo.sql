-- Cerrar acceso anónimo (sin sesión) — auditoría de seguridad 2026-11-24.
--
-- La llave pública de Supabase va en el JavaScript del navegador, así que
-- cualquier política para el rol `anon` es accesible por cualquier persona en
-- internet. Estas tres eran restos de la configuración inicial:
--
--   1. job_notes "Allow all selects." → cualquiera podía leer TODAS las notas
--      de trabajo (302 al momento de la auditoría). Fuga real.
--   2. job_notes "Allow all inserts" y checklist_templates "Allow all inserts."
--      → cualquiera podía crear notas/plantillas.
--   3. storage "Allow all inserts. 1gc2y0h_0" → cualquiera podía subir
--      archivos a cualquier bucket.
--
-- Nada de la app depende de ellas: los empleados entran con sesión
-- (`authenticated`, que ya tiene sus propias políticas en cada tabla/bucket) y
-- las páginas públicas del cliente leen con la service role desde el servidor.

drop policy if exists "Allow all selects." on public.job_notes;
drop policy if exists "Allow all inserts" on public.job_notes;
drop policy if exists "Allow all inserts." on public.checklist_templates;

-- La de storage NO va aquí: storage.objects pertenece a supabase_storage_admin
-- y el editor de SQL puede rechazar el DROP ("must be owner"), lo que revierte
-- todo el script. Bórrala desde el Dashboard → Storage → Policies →
-- "Allow all inserts. 1gc2y0h_0" → Delete.

-- Verificación (después de borrar también la de storage): debe devolver 0 filas.
select schemaname, tablename, policyname, roles
from pg_policies
where 'anon' = any(roles)
  and schemaname in ('public', 'storage');
