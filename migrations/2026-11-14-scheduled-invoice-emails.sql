-- Envío programado de facturas por email.
--
-- En vez de mandar la factura en el momento, la oficina escoge día y hora
-- (hora de Puerto Rico). El cron /api/scheduled-emails/run corre cada 15
-- minutos, toma las filas 'pending' cuya send_at ya pasó y las manda con la
-- misma ruta /api/send-invoice. El correo se arma al momento de enviarlo, así
-- que el balance pendiente sale al día aunque entren abonos entre medio.
--
-- Estados:
--   pending   — esperando su hora
--   sent      — salió (sent_at)
--   cancelled — alguien lo canceló desde la factura
--   skipped   — a la hora de enviar la factura ya estaba pagada o cancelada
--   failed    — Resend o la ruta dieron error (error guarda el mensaje)
--
-- Tier: OFFICE3 (admin, secretaria, vendedor), los mismos roles que pueden
-- enviar una factura en /api/send-invoice. La app lee y escribe con la
-- service role desde el servidor; las políticas son por si alguien consulta
-- con la sesión del navegador.
--
-- Safe to re-run: IF NOT EXISTS y DROP POLICY IF EXISTS.

create table if not exists scheduled_invoice_emails (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  to_email text not null,
  cc text[] not null default '{}',
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'cancelled', 'skipped', 'failed')),
  sent_at timestamptz,
  error text,
  created_by text,
  created_at timestamptz not null default now()
);

-- El cron solo busca pendientes vencidos.
create index if not exists scheduled_invoice_emails_pending_idx
  on scheduled_invoice_emails(send_at)
  where status = 'pending';

create index if not exists scheduled_invoice_emails_invoice_idx
  on scheduled_invoice_emails(invoice_id);

alter table scheduled_invoice_emails enable row level security;

drop policy if exists scheduled_invoice_emails_office3 on scheduled_invoice_emails;
create policy scheduled_invoice_emails_office3 on scheduled_invoice_emails for all
  using (auth_role() in ('admin', 'secretaria', 'vendedor'))
  with check (auth_role() in ('admin', 'secretaria', 'vendedor'));
