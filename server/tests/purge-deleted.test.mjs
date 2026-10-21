import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDeletedEntryPurge, schedulePurge } from '../purge-deleted.mjs';

const supabaseUrl = 'https://project.supabase.co';
const now = Date.parse('2026-11-15T12:00:00.000Z');

function fakeSupabase({ deleted, expired, failStorage = false, media }) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    requests.push({
      body: init.body ? JSON.parse(init.body) : null,
      headers: init.headers,
      method,
      url: decodeURIComponent(url),
    });
    if (method === 'GET' && url.includes('/rest/v1/entries?'))
      return Response.json(
        requests.filter((item) => item.method === 'GET' && item.url.includes('/rest/v1/entries?')).length === 1
          ? expired
          : [],
      );
    if (method === 'GET' && url.includes('/rest/v1/entry_media')) return Response.json(media);
    if (method === 'DELETE' && url.includes('/rest/v1/entries')) return Response.json(deleted);
    if (failStorage && url.includes('/storage/v1/')) return new Response('{"message":"unavailable"}', { status: 503 });
    return new Response(null, { status: 204 });
  };
  return { fetchImpl, requests };
}

test('without the service key there is no purge', () => {
  assert.equal(createDeletedEntryPurge({ supabaseServiceRoleKey: null, supabaseUrl }), null);
  assert.equal(schedulePurge(null), null);
});

test('entries deleted more than 30 days ago are deleted with their photos and a tombstone', async () => {
  const { fetchImpl, requests } = fakeSupabase({
    deleted: [{ id: 'entry-1', sync_version: 4, user_id: 'user-1' }],
    expired: [{ id: 'entry-1', user_id: 'user-1' }],
    media: [{ entry_id: 'entry-1', storage_path: 'user-1/entries/entry-1/cover.jpg' }],
  });

  const result = await createDeletedEntryPurge({
    fetchImpl,
    now: () => now,
    supabaseServiceRoleKey: 'server-secret',
    supabaseUrl,
  }).run();

  assert.deepEqual(result, { purged: 1 });
  const select = requests[0];
  assert.match(select.url, /deleted_at=lt\.2026-10-16T12:00:00\.000Z/);
  assert.equal(select.headers.authorization, 'Bearer server-secret');
  const removal = requests.find((item) => item.method === 'DELETE' && item.url.includes('/rest/v1/entries'));
  assert.match(removal.url, /id=in\.\(entry-1\)/);
  assert.match(removal.url, /deleted_at=lt\.2026-10-16T12:00:00\.000Z/);
  const storage = requests.find((item) => item.url.includes('/storage/v1/object/journal-media'));
  assert.deepEqual(storage.body.prefixes, ['user-1/entries/entry-1/cover.jpg']);
  // Photos are removed before the entry, so a failure never leaves files without their entry.
  assert.ok(requests.indexOf(storage) < requests.indexOf(removal));
  const tombstones = requests.find((item) => item.url.includes('/rest/v1/sync_tombstones'));
  assert.deepEqual(tombstones.body, [
    { entity_id: 'entry-1', entity_type: 'entry', sync_version: 5, user_id: 'user-1' },
  ]);
});

test('an entry restored just before the delete keeps its row and gets no tombstone', async () => {
  const { fetchImpl, requests } = fakeSupabase({
    deleted: [],
    expired: [{ id: 'entry-2', user_id: 'user-1' }],
    media: [{ entry_id: 'entry-2', storage_path: 'user-1/entries/entry-2/photo.jpg' }],
  });

  const result = await createDeletedEntryPurge({
    fetchImpl,
    now: () => now,
    supabaseServiceRoleKey: 'server-secret',
    supabaseUrl,
  }).run();

  assert.deepEqual(result, { purged: 0 });
  assert.equal(
    requests.some((item) => item.url.includes('sync_tombstones')),
    false,
  );
});

test('when removing photos fails, no entry is deleted, so the next run can try again', async () => {
  const { fetchImpl, requests } = fakeSupabase({
    deleted: [{ id: 'entry-4', sync_version: 2, user_id: 'user-1' }],
    expired: [{ id: 'entry-4', user_id: 'user-1' }],
    failStorage: true,
    media: [{ entry_id: 'entry-4', storage_path: 'user-1/entries/entry-4/photo.jpg' }],
  });

  await assert.rejects(
    createDeletedEntryPurge({ fetchImpl, now: () => now, supabaseServiceRoleKey: 'server-secret', supabaseUrl }).run(),
    (error) => error.message === 'Supabase cleanup request failed with 503.',
  );
  assert.equal(
    requests.some((item) => item.method === 'DELETE' && item.url.includes('/rest/v1/entries')),
    false,
  );
});

test("only files inside the owner's own folder are removed", async () => {
  const { fetchImpl, requests } = fakeSupabase({
    deleted: [{ id: 'entry-3', sync_version: 1, user_id: 'user-1' }],
    expired: [{ id: 'entry-3', user_id: 'user-1' }],
    media: [
      { entry_id: 'entry-3', storage_path: 'user-1/entries/entry-3/photo.jpg' },
      { entry_id: 'entry-3', storage_path: 'user-2/entries/other/photo.jpg' },
    ],
  });

  await createDeletedEntryPurge({
    fetchImpl,
    now: () => now,
    supabaseServiceRoleKey: 'server-secret',
    supabaseUrl,
  }).run();

  const storage = requests.find((item) => item.url.includes('/storage/v1/object/journal-media'));
  assert.deepEqual(storage.body.prefixes, ['user-1/entries/entry-3/photo.jpg']);
});

test('a failed request reports only its status, never response content', async () => {
  const purge = createDeletedEntryPurge({
    fetchImpl: async () => new Response('{"title":"secret journal text"}', { status: 500 }),
    now: () => now,
    supabaseServiceRoleKey: 'server-secret',
    supabaseUrl,
  });
  await assert.rejects(purge.run(), (error) => error.message === 'Supabase cleanup request failed with 500.');

  const logged = [];
  const schedule = schedulePurge(purge, {
    log: { error: (line) => logged.push(line), log: () => {} },
    startDelayMs: 60_000,
  });
  await schedule.runOnce();
  schedule.stop();
  assert.deepEqual(logged, ['Recently Deleted cleanup failed. Supabase cleanup request failed with 500.']);
});
