-- Permite pausar los recordatorios automáticos de una factura vencida sin
-- afectar su estado (sigue contando como Vencida en Pendiente/Vencido).
-- NULL = recordatorios activos; con fecha = pausados desde ese momento.
alter table invoices add column if not exists reminders_paused_at timestamptz;
