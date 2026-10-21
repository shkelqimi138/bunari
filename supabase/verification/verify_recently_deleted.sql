-- Recently Deleted — checks that supabase/migrations/20261001234204_recently_deleted.sql is applied (read-only).
--
-- One SELECT, nothing is modified; the Supabase SQL editor shows one result row.
-- Expected: column_ok, index_ok and trigger_ok are all true. The two counts hold no content:
-- once the API's purge job runs, "expired" stays 0 (entries deleted more than 30 days ago are
-- removed within a few hours).
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'deleted_at'
  ) as column_ok,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'entries_deleted_at_idx'
  ) as index_ok,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.entries'::regclass and tgname = 'entries_apply_deletion_time' and not tgisinternal
  ) as trigger_ok,
  (select count(*) from public.entries where deleted_at is not null) as in_recently_deleted,
  (select count(*) from public.entries where deleted_at < now() - interval '30 days') as expired;
