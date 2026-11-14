-- Envío programado también para estimados.
--
-- Reusa scheduled_invoice_emails (2026-11-14) en vez de crear otra tabla: un
-- solo cron (/api/scheduled-emails/run) y una sola ruta para programar y
-- cancelar. Cada fila es de UNA factura o de UN estimado, nunca de los dos.
-- El nombre de la tabla se queda como está para no tocar lo ya desplegado.
--
-- A la hora de enviar, un estimado se omite (status 'skipped') si ya está
-- aceptado, convertido, cancelado, archivado o vencido (valid_until pasado):
-- /api/send-estimate lo marca 'sent', y eso devolvería un aceptado a enviado.
--
-- Las filas existentes son todas de facturas y cumplen el check nuevo.
-- Tier: sin cambio (OFFICE3, misma política).
--
-- Safe to re-run: IF NOT EXISTS y DROP CONSTRAINT IF EXISTS.

alter table scheduled_invoice_emails
  add column if not exists estimate_id uuid references estimates(id) on delete cascade;

alter table scheduled_invoice_emails
  alter column invoice_id drop not null;

alter table scheduled_invoice_emails
  drop constraint if exists scheduled_invoice_emails_one_document;
alter table scheduled_invoice_emails
  add constraint scheduled_invoice_emails_one_document
  check ((invoice_id is null) <> (estimate_id is null));

create index if not exists scheduled_invoice_emails_estimate_idx
  on scheduled_invoice_emails(estimate_id);
