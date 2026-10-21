-- Mood suggestions: the last AI mood suggestion for an entry is kept with it (mood, reason, and a
-- fingerprint of the text it was written for), so the app shows it again and asks the AI again only
-- after the text changes. Regular entries only: a Private entry can never hold one, because the AI
-- never reads Private entries and their text stays encrypted. Run once in the Supabase SQL editor,
-- before any app build that writes mood_suggestion.

alter table public.entries
  add column if not exists mood_suggestion jsonb;

alter table public.entries
  drop constraint if exists entries_mood_suggestion_shape;

alter table public.entries
  add constraint entries_mood_suggestion_shape check (
    mood_suggestion is null
    or (
      not is_private
      and jsonb_typeof(mood_suggestion) = 'object'
      and mood_suggestion->>'mood' in ('Calm', 'Grateful', 'Focused', 'Restless', 'Joyful')
      and char_length(coalesce(mood_suggestion->>'reason', '')) between 1 and 1000
      and char_length(coalesce(mood_suggestion->>'contentKey', '')) between 1 and 64
    )
  );
