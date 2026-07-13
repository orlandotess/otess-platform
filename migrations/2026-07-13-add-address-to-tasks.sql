-- Adds an address column to tasks, mirroring calendar_events.address,
-- so "Nueva tarea" can pull an existing client property into the address field.
alter table tasks add column if not exists address text;
