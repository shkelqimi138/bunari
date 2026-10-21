import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSupabaseAccountAdmin } from '../account-admin.mjs';

test('account deletion removes every user file before deleting only that auth user', async () => {
  const requests = [];
  const listings = new Map([
    [
      'user-1',
      [
        { id: null, name: 'entries' },
        { id: null, name: 'profile' },
      ],
    ],
    ['user-1/entries', [{ id: null, name: 'entry-1' }]],
    ['user-1/entries/entry-1', [{ id: 'media-1', name: 'photo.jpg' }]],
    ['user-1/profile', [{ id: 'avatar-old', name: 'old-avatar.jpg' }]],
  ]);
  const fetchImpl = async (url, init = {}) => {
    requests.push({ body: init.body ? JSON.parse(init.body) : null, method: init.method ?? 'GET', url });
    if (url.includes('/rest/v1/entry_media')) {
      return Response.json([
        { storage_path: 'user-1/entries/entry-1/photo.jpg' },
        { storage_path: 'user-2/entries/entry-9/must-not-delete.jpg' },
      ]);
    }
    if (url.includes('/rest/v1/profiles')) {
      return Response.json([{ avatar_path: 'user-1/profile/current-avatar.jpg' }]);
    }
    if (url.includes('/storage/v1/object/list/')) {
      return Response.json(listings.get(JSON.parse(init.body).prefix) ?? []);
    }
    return Response.json({});
  };

  await createSupabaseAccountAdmin({
    fetchImpl,
    supabaseServiceRoleKey: 'server-secret',
    supabaseUrl: 'https://project.supabase.co',
  }).deleteAccount('user-1');

  const removal = requests.find(
    (request) => request.method === 'DELETE' && request.url.includes('/storage/v1/object/'),
  );
  assert.deepEqual(
    new Set(removal.body.prefixes),
    new Set(['user-1/entries/entry-1/photo.jpg', 'user-1/profile/old-avatar.jpg', 'user-1/profile/current-avatar.jpg']),
  );
  assert.equal(removal.body.prefixes.includes('user-2/entries/entry-9/must-not-delete.jpg'), false);
  const deletion = requests.find((request) => request.url.includes('/auth/v1/admin/users/'));
  assert.equal(deletion.method, 'DELETE');
  assert.equal(deletion.url, 'https://project.supabase.co/auth/v1/admin/users/user-1');
  assert.deepEqual(deletion.body, { should_soft_delete: false });
});
