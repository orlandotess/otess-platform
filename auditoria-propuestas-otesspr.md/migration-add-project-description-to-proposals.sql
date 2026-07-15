-- Adds the "Project Description" section (Portal.io parity, audit Sección A)
-- as a proposal-level field, separate from intro_note (short client greeting)
-- and proposal_options.description (one-line blurb per package option).
-- Run in the Supabase SQL editor.

alter table proposals add column if not exists project_description text;
