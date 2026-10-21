-- Recently Deleted: a deleted entry keeps its row for 30 days with deleted_at set, so it can be
-- restored; after that the API's purge job deletes it for good, with its photos.
-- deleted_at is null for every entry that is not deleted. Run once in the Supabase SQL editor,
-- before any app build that writes deleted_at.

alter table public.entries
  add column if not exists deleted_at timestamptz;

-- The purge job looks for entries deleted more than 30 days ago, across all accounts.
create index if not exists entries_deleted_at_idx
  on public.entries(deleted_at)
  where deleted_at is not null;

-- The 30 days count from the server's clock, not the phone's: deleting sets deleted_at to now(),
-- and saving an entry that is already deleted keeps its first deletion time. A phone with a wrong
-- clock, or an edited request, cannot make an entry expire early or stay forever.
create or replace function public.apply_entry_deletion_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.deleted_at is not null then
    new.deleted_at = old.deleted_at;
  else
    new.deleted_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists entries_apply_deletion_time on public.entries;
create trigger entries_apply_deletion_time
before insert or update of deleted_at
on public.entries
for each row execute function public.apply_entry_deletion_time();
