-- Storage limits per account (security audit, 2026-10-08; limits chosen by the user): an account can
-- keep at most 500 photo files or 250 MB of photos, and 50 MB of notes and other journal data, so one
-- account can never fill the free plan's 1 GB of file storage or 500 MB of database for everyone.
-- Nothing is ever deleted: at a limit, new photos and growing saves are refused (the app keeps them
-- on the device and says why), while deleting and shrinking always work. The API's own jobs (no
-- signed-in user) are never refused. Must match src/domain/storage-limits.ts.
-- Run once in the Supabase SQL editor; safe to run again. Check with
-- verification/verify_account_storage_limits.sql.

begin;

-- Photos: the files in the account's own folder of the journal-media bucket (sizes from Storage's
-- own metadata). A file being uploaded is not counted yet, so the last one may pass a limit by at
-- most the bucket's 15 MB file size.
create or replace function public.journal_media_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 500
     and coalesce(sum((objects.metadata ->> 'size')::bigint), 0) < 250 * 1024 * 1024
  from storage.objects as objects
  where objects.bucket_id = 'journal-media'
    and objects.name like auth.uid()::text || '/%';
$$;

revoke all on function public.journal_media_upload_allowed() from public, anon;
grant execute on function public.journal_media_upload_allowed() to authenticated;

drop policy if exists journal_media_insert_own_folder on storage.objects;
create policy journal_media_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.journal_media_upload_allowed()
  );

-- Notes and other journal data: a running total per account of the size of its rows (as JSON text),
-- kept by the trigger below. Users can read their own total but never change it. Moving a note to
-- Recently Deleted makes its row slightly larger (it gains a deletion time), and deleting a note for
-- good writes a small deletion record for the other devices; both may use up to 1 MB above the limit,
-- so an account at the limit can always delete notes to make room (code review, 2026-10-08).
create table if not exists public.account_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data_bytes bigint not null default 0 check (data_bytes >= 0),
  updated_at timestamptz not null default now()
);

alter table public.account_usage enable row level security;

drop policy if exists account_usage_read_own on public.account_usage;
create policy account_usage_read_own on public.account_usage
  for select to authenticated using (user_id = auth.uid());

create or replace function public.track_account_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  data_limit constant bigint := 50 * 1024 * 1024;
  deletion_allowance constant bigint := 1024 * 1024;
  deletion boolean := tg_table_name = 'sync_tombstones';
  allowed bigint;
  delta bigint;
  used_after bigint;
begin
  if tg_op = 'DELETE' then
    -- Only an existing total is lowered, so deleting a whole account never re-creates one.
    update public.account_usage
      set data_bytes = greatest(0, data_bytes - octet_length(row_to_json(old)::text)), updated_at = now()
      where user_id = old.user_id;
    return null;
  end if;

  if tg_table_name = 'entries' and tg_op = 'UPDATE' then
    deletion := old.deleted_at is null and new.deleted_at is not null;
  end if;
  allowed := data_limit;
  if deletion then
    allowed := data_limit + deletion_allowance;
  end if;

  delta := octet_length(row_to_json(new)::text)
    - case when tg_op = 'UPDATE' then octet_length(row_to_json(old)::text) else 0 end;

  if delta <= 0 or auth.uid() is null then
    insert into public.account_usage as usage (user_id, data_bytes)
      values (new.user_id, greatest(0, delta))
      on conflict (user_id) do update
        set data_bytes = greatest(0, usage.data_bytes + delta), updated_at = now();
    return null;
  end if;

  insert into public.account_usage as usage (user_id, data_bytes)
    values (new.user_id, delta)
    on conflict (user_id) do update
      set data_bytes = usage.data_bytes + delta, updated_at = now()
      where usage.data_bytes + delta <= allowed
    returning usage.data_bytes into used_after;

  if used_after is null or used_after > allowed then
    raise exception 'Storage limit reached: an account can keep up to 50 MB of notes and other journal data. Delete notes you no longer need, then delete them for good in Recently Deleted.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke all on function public.track_account_data() from public, anon, authenticated;

-- After each row change, so the total sees the row as it is finally saved.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'entries', 'entry_media', 'journal_sections', 'prompt_favorites', 'streak_events', 'sync_tombstones', 'todo_items', 'trips'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_track_account_data', table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.track_account_data()',
      table_name || '_track_account_data', table_name
    );
  end loop;
end;
$$;

-- The totals for the data already saved (the triggers above hold off other writes until this
-- transaction ends, so nothing is counted twice).
insert into public.account_usage (user_id, data_bytes)
select user_id, sum(bytes)
from (
  select user_id, octet_length(row_to_json(t)::text) as bytes from public.entries as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.entry_media as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.journal_sections as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.prompt_favorites as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.streak_events as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.sync_tombstones as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.todo_items as t
  union all select user_id, octet_length(row_to_json(t)::text) from public.trips as t
) as rows
group by user_id
on conflict (user_id) do update set data_bytes = excluded.data_bytes, updated_at = now();

commit;
