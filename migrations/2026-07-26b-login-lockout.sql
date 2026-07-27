-- Adds brute-force protection for /login: after 5 failed password attempts
-- the account is locked for 15 minutes (see app/api/login/route.js).
--
-- Safe to re-run: IF NOT EXISTS guards on every column add.

alter table profiles add column if not exists failed_attempts int not null default 0;
alter table profiles add column if not exists locked_until timestamptz;
