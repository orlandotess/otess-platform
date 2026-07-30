-- Archive Estimate feature
-- Adds an archived_at timestamp to estimates. Null = active/visible in the
-- default list; non-null = archived (hidden from the default list, still
-- reachable via a "Ver archivadas" toggle). Independent of `status`, so a
-- draft, sent, accepted, or converted estimate can also be archived.

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS archived_at timestamptz;
