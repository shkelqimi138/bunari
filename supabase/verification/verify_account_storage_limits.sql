-- Storage limits per account — checks that supabase/migrations/20261008142031_account_storage_limits.sql
-- is applied (read-only). Shows only counts and sizes, never journal content.

-- 1. Both functions exist and run with their owner's rights: expect 2 rows, security_definer = true.
select proname as function_name, prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('journal_media_upload_allowed', 'track_account_data')
order by proname;

-- 2. The upload policy checks the photo limit: expect 1 row, uses_limit = true.
select policyname, with_check like '%journal_media_upload_allowed%' as uses_limit
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'journal_media_insert_own_folder';

-- 3. The data total is kept for all 8 tables: expect 8 rows.
select event_object_table as table_name
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like '%_track_account_data'
group by event_object_table
order by event_object_table;

-- 4. The largest accounts by notes and other journal data (limit 50 MB).
select user_id, round(data_bytes / 1048576.0, 2) as data_mb
from public.account_usage
order by data_bytes desc
limit 10;

-- 5. The largest accounts by photos (limits 500 files, 250 MB).
select split_part(name, '/', 1) as user_id, count(*) as photos,
  round(coalesce(sum((metadata ->> 'size')::bigint), 0) / 1048576.0, 2) as photo_mb
from storage.objects
where bucket_id = 'journal-media'
group by 1
order by photo_mb desc
limit 10;
