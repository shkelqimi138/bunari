begin;

alter table public.user_settings
  drop constraint if exists user_settings_theme_check;

update public.user_settings
set theme = 'dark'
where theme = 'system';

alter table public.user_settings
  add constraint user_settings_theme_check check (theme in ('dark', 'light'));

commit;
