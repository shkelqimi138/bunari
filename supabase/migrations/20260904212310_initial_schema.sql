begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.sync_version = old.sync_version + 1;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0)
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  face_id_enabled boolean not null default false,
  daily_prompt_reminder_enabled boolean not null default false,
  daily_prompt_reminder_time time,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0)
);

create table public.journal_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  built_in_key text check (
    built_in_key is null or built_in_key in (
      'home', 'private', 'todo', 'finance', 'fitness', 'thoughts', 'travel', 'other'
    )
  ),
  name text not null check (char_length(name) between 1 and 80),
  emoji text not null check (char_length(emoji) between 1 and 16),
  position smallint not null default 0 check (position >= 0),
  collapsed boolean not null default false,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  unique (id, user_id)
);

create unique index journal_sections_user_built_in_key_idx
  on public.journal_sections(user_id, built_in_key)
  where built_in_key is not null;

create table public.trips (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null check (char_length(destination) between 1 and 160),
  emoji text not null check (char_length(emoji) between 1 and 16),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  check (end_date >= start_date),
  unique (id, user_id)
);

create table public.entries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null,
  title text,
  description text,
  body jsonb,
  plain_text text,
  mood text check (mood is null or mood in ('Calm', 'Grateful', 'Focused', 'Restless', 'Joyful')),
  location_label text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  reviewed boolean not null default false,
  favorite boolean not null default false,
  is_private boolean not null default false,
  private_payload_ciphertext text,
  private_payload_nonce text,
  private_payload_version smallint,
  entry_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  foreign key (section_id, user_id)
    references public.journal_sections(id, user_id) on delete cascade,
  check (
    (
      is_private
      and title is null
      and description is null
      and body is null
      and plain_text is null
      and mood is null
      and location_label is null
      and latitude is null
      and longitude is null
      and private_payload_ciphertext is not null
      and private_payload_nonce is not null
      and private_payload_version is not null
    )
    or
    (
      not is_private
      and title is not null
      and body is not null
      and private_payload_ciphertext is null
      and private_payload_nonce is null
      and private_payload_version is null
    )
  ),
  unique (id, user_id)
);

create index entries_user_section_date_idx
  on public.entries(user_id, section_id, entry_date desc);
create index entries_user_entry_date_idx
  on public.entries(user_id, entry_date desc);
create index entries_user_mood_idx
  on public.entries(user_id, mood)
  where mood is not null and not is_private;

create or replace function public.apply_entry_privacy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  section_is_private boolean;
begin
  select is_private
    into section_is_private
    from public.journal_sections
   where id = new.section_id and user_id = new.user_id;

  if not found then
    raise exception 'Entry section does not belong to this user';
  end if;

  new.is_private = section_is_private;
  return new;
end;
$$;

create trigger entries_apply_privacy
before insert or update of section_id, user_id, is_private,
  title, description, body, plain_text, mood, location_label,
  latitude, longitude, private_payload_ciphertext, private_payload_nonce,
  private_payload_version
on public.entries
for each row execute function public.apply_entry_privacy();

create table public.entry_media (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  storage_path text not null,
  is_cover boolean not null default false,
  sort_order smallint not null default 0 check (sort_order >= 0),
  is_private boolean not null default false,
  mime_type text,
  captured_at timestamptz,
  private_metadata_ciphertext text,
  private_metadata_nonce text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  foreign key (entry_id, user_id)
    references public.entries(id, user_id) on delete cascade,
  unique (storage_path),
  check (
    (is_private and mime_type is null and captured_at is null
      and private_metadata_ciphertext is not null and private_metadata_nonce is not null)
    or
    (not is_private and mime_type is not null
      and private_metadata_ciphertext is null and private_metadata_nonce is null)
  )
);

create unique index entry_media_one_cover_idx
  on public.entry_media(entry_id)
  where is_cover;

create or replace function public.apply_entry_media_privacy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry_is_private boolean;
begin
  select is_private
    into entry_is_private
    from public.entries
   where id = new.entry_id and user_id = new.user_id;

  if not found then
    raise exception 'Media entry does not belong to this user';
  end if;

  new.is_private = entry_is_private;
  return new;
end;
$$;

create trigger entry_media_apply_privacy
before insert or update on public.entry_media
for each row execute function public.apply_entry_media_privacy();

create table public.todo_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  text text not null check (char_length(text) between 1 and 1000),
  due_tag text,
  completed boolean not null default false,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  foreign key (entry_id, user_id)
    references public.entries(id, user_id) on delete cascade
);

create table public.prompt_categories (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  position smallint not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompts (
  id text primary key check (char_length(id) between 1 and 120),
  category_id text not null references public.prompt_categories(id),
  text text not null check (char_length(text) between 1 and 2000),
  estimated_minutes smallint not null default 3 check (estimated_minutes between 1 and 60),
  source text not null default 'curated' check (source in ('curated', 'ai')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompt_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id text not null references public.prompts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, prompt_id)
);

create table public.daily_prompts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null,
  prompt_text text not null check (char_length(prompt_text) between 1 and 2000),
  estimated_minutes smallint not null default 5 check (estimated_minutes between 3 and 15),
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  unique (user_id, local_date)
);

create table public.weekly_summaries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0),
  check (period_end >= period_start),
  unique (user_id, period_start, period_end)
);

create table public.streak_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.private_key_envelopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wrapped_master_key text not null,
  wrapping_nonce text not null,
  recovery_salt text not null,
  kdf text not null,
  kdf_parameters jsonb not null,
  encryption_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version > 0)
);

create table public.sync_tombstones (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('entry', 'entry_media', 'todo_item', 'trip')),
  entity_id uuid not null,
  deleted_at timestamptz not null default now(),
  sync_version bigint not null check (sync_version > 0),
  unique (user_id, entity_type, entity_id)
);

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
    (new.id, 'home', 'Home', '🏠', 0, false),
    (new.id, 'private', 'Private', '🔒', 1, true),
    (new.id, 'todo', 'To-Do', '✅', 2, false),
    (new.id, 'finance', 'Finance', '💰', 3, false),
    (new.id, 'fitness', 'Fitness', '💪', 4, false),
    (new.id, 'thoughts', 'Random Thoughts', '🧠', 5, false),
    (new.id, 'travel', 'Travel', '✈️', 6, false),
    (new.id, 'other', 'Other', '🎁', 7, false);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_new_user_records();

insert into public.profiles(id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
on conflict do nothing;

insert into public.user_settings(user_id)
select id from auth.users
on conflict do nothing;

insert into public.journal_sections(user_id, built_in_key, name, emoji, position, is_private)
select users.id, sections.built_in_key, sections.name, sections.emoji, sections.position, sections.is_private
from auth.users as users
cross join (
  values
    ('home', 'Home', '🏠', 0, false),
    ('private', 'Private', '🔒', 1, true),
    ('todo', 'To-Do', '✅', 2, false),
    ('finance', 'Finance', '💰', 3, false),
    ('fitness', 'Fitness', '💪', 4, false),
    ('thoughts', 'Random Thoughts', '🧠', 5, false),
    ('travel', 'Travel', '✈️', 6, false),
    ('other', 'Other', '🎁', 7, false)
) as sections(built_in_key, name, emoji, position, is_private)
on conflict do nothing;

insert into public.prompt_categories(id, name, description, icon, position)
values
  ('gratitude', 'Gratitude', 'Notice what is already good.', 'heart', 0),
  ('reflection', 'Reflection', 'Look back to see forward.', 'sun', 1),
  ('creativity', 'Creativity', 'Follow an odd thread.', 'lightbulb', 2),
  ('fitness', 'Fitness', 'Check in with the body.', 'activity', 3),
  ('mindfulness', 'Mindfulness', 'Arrive where you are.', 'clock', 4),
  ('fun', 'Fun', 'Do not overthink it.', 'smile', 5),
  ('year-ahead', 'The Year Ahead', 'Set an intention.', 'calendar', 6),
  ('love', 'Love', 'The people who stay.', 'sparkles', 7);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.journal_sections enable row level security;
alter table public.trips enable row level security;
alter table public.entries enable row level security;
alter table public.entry_media enable row level security;
alter table public.todo_items enable row level security;
alter table public.prompt_categories enable row level security;
alter table public.prompts enable row level security;
alter table public.prompt_favorites enable row level security;
alter table public.daily_prompts enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.streak_events enable row level security;
alter table public.private_key_envelopes enable row level security;
alter table public.sync_tombstones enable row level security;

create policy profiles_own_rows on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy user_settings_own_rows on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_sections_own_rows on public.journal_sections
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trips_own_rows on public.trips
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy entries_own_rows on public.entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy entry_media_own_rows on public.entry_media
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy todo_items_own_rows on public.todo_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prompt_categories_authenticated_read on public.prompt_categories
  for select to authenticated using (true);
create policy prompts_authenticated_read on public.prompts
  for select to authenticated using (true);
create policy prompt_favorites_own_rows on public.prompt_favorites
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy daily_prompts_own_rows on public.daily_prompts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weekly_summaries_own_rows on public.weekly_summaries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy streak_events_own_rows on public.streak_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy private_key_envelopes_own_rows on public.private_key_envelopes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sync_tombstones_own_rows on public.sync_tombstones
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger profiles_update_metadata before update on public.profiles
  for each row execute function public.set_updated_at_and_version();
create trigger user_settings_update_metadata before update on public.user_settings
  for each row execute function public.set_updated_at_and_version();
create trigger journal_sections_update_metadata before update on public.journal_sections
  for each row execute function public.set_updated_at_and_version();
create trigger trips_update_metadata before update on public.trips
  for each row execute function public.set_updated_at_and_version();
create trigger entries_update_metadata before update on public.entries
  for each row execute function public.set_updated_at_and_version();
create trigger entry_media_update_metadata before update on public.entry_media
  for each row execute function public.set_updated_at_and_version();
create trigger todo_items_update_metadata before update on public.todo_items
  for each row execute function public.set_updated_at_and_version();
create trigger daily_prompts_update_metadata before update on public.daily_prompts
  for each row execute function public.set_updated_at_and_version();
create trigger weekly_summaries_update_metadata before update on public.weekly_summaries
  for each row execute function public.set_updated_at_and_version();
create trigger private_key_envelopes_update_metadata before update on public.private_key_envelopes
  for each row execute function public.set_updated_at_and_version();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-media',
  'journal-media',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/octet-stream']
);

create policy journal_media_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journal-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy journal_media_select_own_folder on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy journal_media_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'journal-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'journal-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy journal_media_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal-media' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
