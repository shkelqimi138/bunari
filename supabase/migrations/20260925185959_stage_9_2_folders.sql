-- Stage 9.2 — user-managed folders.
--
-- Optional but recommended; the app works without it. Run once in the Supabase
-- SQL editor while the iPhone shows no pending sync changes. Safe to run again.
--
-- 1. Deleting a folder must never delete its entries. The app moves entries out
--    before removing a folder; this makes the database refuse a delete that would
--    still take entries with it. NO ACTION (not RESTRICT) is checked at the end of
--    the statement, so deleting a whole account still cascades normally.
-- 2. The retired Travel and Other folders: their entries move to Notes (the `home`
--    key), a Travel entry without a trip is linked to the one trip covering its
--    date, and the empty folders are removed.
-- 3. New accounts get the new default folders.

begin;

-- 1. Entries block deleting their folder.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.entries'::regclass
    and con.confrelid = 'public.journal_sections'::regclass
    and con.contype = 'f';
  if constraint_name is not null then
    execute format('alter table public.entries drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.entries
  add constraint entries_section_user_fkey
  foreign key (section_id, user_id)
  references public.journal_sections(id, user_id)
  on delete no action;

-- 2a. Link trip-less Travel entries to the single trip covering their date.
update public.entries e
set trip_id = matched.trip_id
from (
  select e2.id as entry_id, min(t.id::text)::uuid as trip_id
  from public.entries e2
  join public.journal_sections s on s.id = e2.section_id and s.built_in_key = 'travel'
  join public.trips t on t.user_id = e2.user_id
    and e2.entry_date >= t.start_date::timestamptz
    and e2.entry_date < (t.end_date + 1)::timestamptz
  where e2.trip_id is null and not e2.is_private
  group by e2.id
  having count(*) = 1
) matched
where e.id = matched.entry_id;

-- 2b. Move Travel and Other entries to Notes.
update public.entries e
set section_id = notes.id
from public.journal_sections retired
join public.journal_sections notes
  on notes.user_id = retired.user_id and notes.built_in_key = 'home'
where e.section_id = retired.id
  and retired.built_in_key in ('travel', 'other');

-- 2c. Remove the now-empty retired folders.
delete from public.journal_sections s
where s.built_in_key in ('travel', 'other')
  and not exists (select 1 from public.entries e where e.section_id = s.id);

-- Built-in folder names as the app shows them.
update public.journal_sections set name = 'Notes', emoji = '📝' where built_in_key = 'home';
update public.journal_sections set name = 'Thoughts' where built_in_key = 'thoughts';

-- 3. Default folders for new accounts.
create or replace function public.create_new_user_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));

  insert into public.user_settings(user_id)
  values (new.id);

  insert into public.journal_sections(user_id, built_in_key, name, emoji, position, is_private)
  values
    (new.id, 'home', 'Notes', '📝', 0, false),
    (new.id, 'private', 'Private', '🔒', 1, true),
    (new.id, 'todo', 'To-Do', '✅', 2, false),
    (new.id, 'finance', 'Finance', '💰', 3, false),
    (new.id, 'fitness', 'Fitness', '💪', 4, false),
    (new.id, 'thoughts', 'Thoughts', '🧠', 5, false);

  return new;
end;
$$;

commit;
