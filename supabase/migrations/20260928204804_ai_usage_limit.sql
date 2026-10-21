-- Counts new AI results per user per UTC day in the database, so the API's daily AI limit
-- survives server restarts and holds across several server instances.
-- Users can read their own counts but never change them; only take_ai_quota() adds to them.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

-- Adds one use for the signed-in user today and returns true, or returns false when today's
-- uses already reached daily_limit. Runs as the owner because users cannot write ai_usage.
create or replace function public.take_ai_quota(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  used_after integer;
begin
  if current_user_id is null then
    raise exception 'A signed-in user is required';
  end if;
  if daily_limit is null or daily_limit < 1 or daily_limit > 1000 then
    raise exception 'daily_limit must be between 1 and 1000';
  end if;

  insert into public.ai_usage as usage (user_id, usage_date, used)
  values (current_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date) do update
    set used = usage.used + 1
    where usage.used < daily_limit
  returning usage.used into used_after;

  return used_after is not null;
end;
$$;

revoke all on function public.take_ai_quota(integer) from public, anon;
grant execute on function public.take_ai_quota(integer) to authenticated;
