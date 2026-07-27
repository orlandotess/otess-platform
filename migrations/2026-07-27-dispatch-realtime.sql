-- Habilita Supabase Realtime para las tablas que usa el Dispatch Board
-- (/admin/dispatch), para que el board se refresque solo cuando un job
-- cambia desde otra pestaña o desde la Crew App, sin recargar la página.
-- Correr en el SQL Editor de Supabase (Database > Replication no lista
-- estas tablas hasta que se agregan a la publicación).

alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table job_schedule_days;
alter publication supabase_realtime add table job_technicians;
