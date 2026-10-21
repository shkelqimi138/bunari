-- Stage 8 — destructive account-deletion verification (read-only).
--
-- Every statement here is a SELECT; nothing is modified. Run it in the Supabase
-- SQL editor. Record the results outside this file.
--
-- Procedure
--   1. On the iPhone (TestFlight build), sign up a disposable account (A).
--      Keep your real account (B) untouched on another device or sign back in later.
--   2. In account A create: one regular entry with a cover and two photos, one
--      To-Do entry with a dated item, one trip with a Travel entry, a favorite
--      prompt, set an avatar, enable Private and add one Private entry with a photo.
--      Wait until the sync status is idle.
--   3. In Supabase > Authentication > Users, copy the UUIDs of account A and B and
--      replace the placeholder UUIDs in both `ids` CTEs below.
--   4. Run section 1 (Private exclusion) and section 2 (footprint). Save the
--      section 2 output: account B's counts must be identical after deletion.
--   5. In the app: More > Delete Profile. Check the confirmation text explains what
--      is removed, confirm, and verify the app returns to sign-in.
--   6. Run section 2 again and section 3 (orphans). Every account A count must be 0,
--      account B counts must equal step 4, and section 3 must return no rows.
--   7. Sign in to account B and confirm its entries, photos, and Private journal
--      still open. Try to sign in to account A: it must fail.

-- ─── Section 1: Private content never stored in plaintext (run before deletion) ───
-- Expected: zero rows.
with ids as (select '00000000-0000-0000-0000-00000000000a'::uuid as account_a)
select 'entries' as source, e.id, 'plaintext column set on a Private entry' as problem
from public.entries e, ids
where e.user_id = ids.account_a
  and e.is_private
  and (e.title is not null or e.description is not null or e.body is not null
       or e.plain_text is not null or e.mood is not null or e.location_label is not null
       or e.latitude is not null or e.longitude is not null
       or e.private_payload_ciphertext is null)
union all
select 'entry_media', m.id, 'readable metadata on Private media'
from public.entry_media m, ids
where m.user_id = ids.account_a
  and m.is_private
  and (m.mime_type is not null or m.captured_at is not null or m.private_metadata_ciphertext is null)
union all
select 'todo_items', t.id, 'plaintext To-Do attached to a Private entry'
from public.todo_items t
join public.entries e on e.id = t.entry_id, ids
where t.user_id = ids.account_a and e.is_private;

-- ─── Section 2: per-account footprint (run before AND after deletion) ───
-- Before: account A has non-zero counts. After: every account A count is 0 and
-- account B counts are unchanged.
with ids as (
  select '00000000-0000-0000-0000-00000000000a'::uuid as account_a,
         '00000000-0000-0000-0000-00000000000b'::uuid as account_b
),
accounts as (
  select 'A (deleted)' as account, account_a as user_id from ids
  union all
  select 'B (kept)', account_b from ids
)
select a.account, x.source, x.row_count
from accounts a
cross join lateral (
  values
    ('auth.users',                   (select count(*) from auth.users where id = a.user_id)),
    ('auth.identities',              (select count(*) from auth.identities where user_id = a.user_id)),
    ('auth.sessions',                (select count(*) from auth.sessions where user_id = a.user_id)),
    ('profiles',                     (select count(*) from public.profiles where id = a.user_id)),
    ('user_settings',                (select count(*) from public.user_settings where user_id = a.user_id)),
    ('journal_sections',             (select count(*) from public.journal_sections where user_id = a.user_id)),
    ('entries (regular)',            (select count(*) from public.entries where user_id = a.user_id and not is_private)),
    ('entries (Private)',            (select count(*) from public.entries where user_id = a.user_id and is_private)),
    ('entry_media',                  (select count(*) from public.entry_media where user_id = a.user_id)),
    ('todo_items',                   (select count(*) from public.todo_items where user_id = a.user_id)),
    ('trips',                        (select count(*) from public.trips where user_id = a.user_id)),
    ('prompt_favorites',             (select count(*) from public.prompt_favorites where user_id = a.user_id)),
    ('daily_prompts',                (select count(*) from public.daily_prompts where user_id = a.user_id)),
    ('weekly_summaries',             (select count(*) from public.weekly_summaries where user_id = a.user_id)),
    ('streak_events',                (select count(*) from public.streak_events where user_id = a.user_id)),
    ('private_key_envelopes',        (select count(*) from public.private_key_envelopes where user_id = a.user_id)),
    ('sync_tombstones',              (select count(*) from public.sync_tombstones where user_id = a.user_id)),
    ('storage: journal-media files', (select count(*) from storage.objects
                                        where bucket_id = 'journal-media'
                                          and name like a.user_id::text || '/%'))
) as x(source, row_count)
order by a.account, x.source;

-- ─── Section 3: orphaned storage files (run after deletion) ───
-- Expected: zero rows. Storage files whose owner folder no longer belongs to any user.
select name
from storage.objects o
where o.bucket_id = 'journal-media'
  and not exists (
    select 1 from auth.users u where o.name like u.id::text || '/%'
  )
limit 50;

-- ─── Section 4: AI usage counts (only after applying migrations/20260928204804_ai_usage_limit.sql) ───
-- Expected: zero rows. AI usage rows whose owner no longer exists (they are removed with the account).
select a.user_id, a.usage_date
from public.ai_usage a
where not exists (select 1 from auth.users u where u.id = a.user_id)
limit 50;
