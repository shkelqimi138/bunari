-- Mood suggestions — checks that supabase/migrations/20261002003139_mood_suggestion.sql is applied (read-only).
--
-- One SELECT, nothing is modified; the Supabase SQL editor shows one result row.
-- Expected: column_ok and constraint_ok are true, and private_with_suggestion is 0.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'mood_suggestion'
  ) as column_ok,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.entries'::regclass and conname = 'entries_mood_suggestion_shape'
  ) as constraint_ok,
  (select count(*) from public.entries where is_private and mood_suggestion is not null) as private_with_suggestion;
