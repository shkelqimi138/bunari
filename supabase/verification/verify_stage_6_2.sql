select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'user_settings', 'journal_sections', 'trips', 'entries',
    'entry_media', 'todo_items', 'prompt_categories', 'prompts',
    'prompt_favorites', 'daily_prompts', 'weekly_summaries', 'streak_events',
    'private_key_envelopes', 'sync_tombstones'
  )
order by table_name;

select schemaname, tablename, policyname
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'journal-media';
