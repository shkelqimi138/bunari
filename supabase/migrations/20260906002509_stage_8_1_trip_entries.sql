alter table public.entries
  add column if not exists trip_id uuid;

alter table public.entries
  add constraint entries_trip_user_fkey
  foreign key (trip_id)
  references public.trips(id)
  on delete set null;

create index if not exists entries_user_trip_date_idx
  on public.entries(user_id, trip_id, entry_date desc)
  where trip_id is not null;
