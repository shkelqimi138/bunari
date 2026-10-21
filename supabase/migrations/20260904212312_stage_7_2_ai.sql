alter table public.daily_prompts
  add column if not exists estimated_minutes smallint not null default 5
  check (estimated_minutes between 3 and 15);
