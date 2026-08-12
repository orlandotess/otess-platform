-- Búsqueda global (barra del sidebar). Columna generada tsvector + índice GIN
-- por tabla, en vez de un LIKE por columna, para que la búsqueda escale y
-- tolere acentos/formas de palabra en español. app/api/search/route.js arma
-- un tsquery con sufijo :* por palabra (prefix match) y hace .textSearch()
-- sobre cada tabla en paralelo, limitando qué tablas se consultan según el
-- rol (mismo criterio que TECNICO_ALLOWED/VENDEDOR_BLOCKED en middleware.js).

alter table clients add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(notes, ''))
  ) stored;
create index if not exists clients_search_vector_idx on clients using gin (search_vector);

alter table client_properties add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(street, '') || ' ' || coalesce(city, '') || ' ' || coalesce(note, ''))
  ) stored;
create index if not exists client_properties_search_vector_idx on client_properties using gin (search_vector);

alter table client_contacts add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))
  ) stored;
create index if not exists client_contacts_search_vector_idx on client_contacts using gin (search_vector);

alter table jobs add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(job_number, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(property_name, '') || ' ' || coalesce(street, '') || ' ' || coalesce(city, ''))
  ) stored;
create index if not exists jobs_search_vector_idx on jobs using gin (search_vector);

alter table invoices add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(invoice_number, ''))
  ) stored;
create index if not exists invoices_search_vector_idx on invoices using gin (search_vector);

alter table estimates add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(estimate_number, '') || ' ' || coalesce(title, ''))
  ) stored;
create index if not exists estimates_search_vector_idx on estimates using gin (search_vector);

alter table proposals add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(proposal_number, '') || ' ' || coalesce(title, ''))
  ) stored;
create index if not exists proposals_search_vector_idx on proposals using gin (search_vector);

alter table service_tickets add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(ticket_number, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(description, '') || ' ' || coalesce(contact_name, ''))
  ) stored;
create index if not exists service_tickets_search_vector_idx on service_tickets using gin (search_vector);
