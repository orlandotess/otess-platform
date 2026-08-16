-- Drop the legacy `requests` table
-- Leftover from the original Requests module (commit 0b31b8d, 2026-07-03), which
-- paired a `requests` table with a `visits` table for on-site assessments. The
-- `visits` half never actually shipped — no migration ever created it — and twelve
-- days later the Solicitudes module (3f4996f) replaced the whole concept with
-- solicitudes.assessment_date. The last reader of `requests` was deleted in
-- "Point the calendar's Visitas layer at solicitud assessments".
--
-- Verified before writing this on 2026-08-16, querying with the service role so RLS
-- was not hiding anything: `requests` holds 0 rows, no code references it, and no
-- migration declares a foreign key pointing at it.
--
-- Deliberately no CASCADE: if some object not visible from the repo still depends on
-- this table, the DROP should fail loudly rather than quietly take that object with
-- it. If it errors, read the dependency it names before doing anything else.

DROP TABLE IF EXISTS requests;
