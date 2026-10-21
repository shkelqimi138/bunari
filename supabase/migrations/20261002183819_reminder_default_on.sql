-- The daily writing reminder is on by default for new accounts, at 20:00 (user, 2026-10-02).
-- Existing accounts keep their own setting. The app asks for notification permission the first
-- time it schedules the reminder; if that is declined it switches the reminder off again.
alter table public.user_settings
  alter column daily_prompt_reminder_enabled set default true,
  alter column daily_prompt_reminder_time set default '20:00';
