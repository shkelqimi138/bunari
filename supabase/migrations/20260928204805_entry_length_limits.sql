-- Caps the size of regular entries so one account cannot store unlimited text (security re-audit
-- 2026-09-28). The limits are well above what the app lets you write (title 300 and description
-- 2,000 characters), so normal saves never hit them. Private entries keep these columns empty.
-- NOT VALID: existing rows are not checked, so applying this cannot fail; new and changed rows are.

alter table public.entries
  drop constraint if exists entries_title_length,
  drop constraint if exists entries_description_length,
  drop constraint if exists entries_plain_text_length,
  drop constraint if exists entries_body_size,
  drop constraint if exists entries_location_label_length;

alter table public.entries
  add constraint entries_title_length
    check (title is null or char_length(title) <= 1000) not valid,
  add constraint entries_description_length
    check (description is null or char_length(description) <= 10000) not valid,
  add constraint entries_plain_text_length
    check (plain_text is null or char_length(plain_text) <= 1000000) not valid,
  add constraint entries_body_size
    check (body is null or octet_length(body::text) <= 5000000) not valid,
  add constraint entries_location_label_length
    check (location_label is null or char_length(location_label) <= 500) not valid;
