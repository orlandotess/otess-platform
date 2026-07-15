-- Links technicians to their profiles row (reliable email lookup) instead of
-- matching by name at read time. New technicians rows already set this going
-- forward (invite-user, changeRole, enableAsTechnician); this backfills existing ones.
alter table technicians add column if not exists profile_id uuid references profiles(id);

create extension if not exists unaccent;

update technicians t
set profile_id = p.id
from profiles p
where t.profile_id is null
  and lower(trim(unaccent(t.name))) = lower(trim(unaccent(p.name)));

-- Run this after to see which technicians still need manual linking
-- (name didn't match any profile exactly):
-- select id, name from technicians where profile_id is null;
