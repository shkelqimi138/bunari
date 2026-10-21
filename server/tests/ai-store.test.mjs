import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSupabaseAiStore } from '../ai-store.mjs';

test('entry AI lookup enforces user ownership and excludes Private and deleted rows', async () => {
  let captured;
  const store = createSupabaseAiStore({
    fetchImpl: async (url, init) => {
      captured = { init, url };
      return new Response('[]', { headers: { 'content-type': 'application/json' }, status: 200 });
    },
    supabasePublishableKey: 'publishable',
    supabaseUrl: 'https://project.supabase.co',
  });
  await store.getEntry({
    authorization: 'Bearer user-token',
    entryId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
  });
  const url = new URL(captured.url);
  assert.equal(url.searchParams.get('is_private'), 'eq.false');
  assert.equal(url.searchParams.get('deleted_at'), 'is.null');
  assert.equal(url.searchParams.get('user_id'), 'eq.22222222-2222-4222-8222-222222222222');
  assert.equal(captured.init.headers.authorization, 'Bearer user-token');
});

test('weekly AI lookup excludes Private and deleted rows', async () => {
  let capturedUrl;
  const store = createSupabaseAiStore({
    fetchImpl: async (url) => {
      capturedUrl = url;
      return new Response('[]', { headers: { 'content-type': 'application/json' }, status: 200 });
    },
    supabasePublishableKey: 'publishable',
    supabaseUrl: 'https://project.supabase.co',
  });
  await store.listWeeklyEntries({
    authorization: 'Bearer user-token',
    endExclusive: '2026-09-07',
    periodStart: '2026-08-31',
    userId: '22222222-2222-4222-8222-222222222222',
  });
  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get('is_private'), 'eq.false');
  assert.equal(url.searchParams.get('deleted_at'), 'is.null');
  assert.deepEqual(url.searchParams.getAll('entry_date'), ['gte.2026-08-31T00:00:00', 'lt.2026-09-07T00:00:00']);
});
