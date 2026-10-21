import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  dataLimitMegabytes,
  dataLimitMessage,
  hasStorageLimitIssue,
  photoLimitCount,
  photoLimitMegabytes,
  photoLimitMessage,
  storageLimitMessage,
} from '../src/domain/storage-limits.ts';

const migrationName = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find((name) =>
  name.endsWith('_account_storage_limits.sql'),
);
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

test('the app and the database use the same limits: 500 photos or 250 MB, and 50 MB of data (user, 2026-10-08)', () => {
  assert.equal(photoLimitCount, 500);
  assert.equal(photoLimitMegabytes, 250);
  assert.equal(dataLimitMegabytes, 50);
  assert.match(migration, new RegExp(`count\\(\\*\\) < ${photoLimitCount}\\b`));
  assert.match(migration, new RegExp(`< ${photoLimitMegabytes} \\* 1024 \\* 1024`));
  assert.match(migration, new RegExp(`data_limit constant bigint := ${dataLimitMegabytes} \\* 1024 \\* 1024`));
  // The database writes this message itself, so the two must stay word for word the same.
  assert.ok(migration.includes(`raise exception '${dataLimitMessage}'`));
});

test('a refusal because of a limit reads in plain words; other errors are left alone', () => {
  // What Supabase answers when a note would pass the data limit (checked on a local Supabase, 2026-10-08).
  assert.equal(storageLimitMessage({ code: 'P0001', message: dataLimitMessage }), dataLimitMessage);
  // What Storage answers when a photo would pass the photo limit.
  const refused = Object.assign(new Error('new row violates row-level security policy'), {
    name: 'StorageApiError',
    status: 400,
    statusCode: '403',
  });
  assert.equal(storageLimitMessage(refused), photoLimitMessage);
  assert.equal(
    storageLimitMessage({ code: '42501', message: 'new row violates row-level security policy for table "entries"' }),
    null,
    'not a Storage answer',
  );
  assert.equal(storageLimitMessage(new Error('Network request failed')), null);
  assert.equal(storageLimitMessage(null), null);
  assert.equal(storageLimitMessage('Storage limit reached'), null);
});

test('the app stops retrying by itself while a storage limit refuses a change (code review, 2026-10-08)', () => {
  const limit = {
    message: `Could not sync this journal entry. ${photoLimitMessage} It remains safely stored on this device.`,
  };
  const network = {
    message:
      'Could not sync this journal entry. The network connection was lost. It remains safely stored on this device.',
  };
  assert.equal(hasStorageLimitIssue([network, limit]), true);
  assert.equal(
    hasStorageLimitIssue([
      { message: `An encrypted Private change could not sync. ${dataLimitMessage} It remains safely on this device.` },
    ]),
    true,
  );
  assert.equal(hasStorageLimitIssue([network]), false, 'other problems are still retried every few seconds');
  assert.equal(hasStorageLimitIssue([]), false);
});

test('the terms and the privacy policy state the same limits as the app (pre-launch audit, 2026-10-08)', () => {
  const site = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
  assert.ok(
    site.includes(
      `Each account can keep up to ${photoLimitCount} photos or ${photoLimitMegabytes} MB of photos, and ${dataLimitMegabytes} MB of notes and other journal data.`,
    ),
  );
  assert.match(site, /how much space your account uses, for the storage limits/);
  assert.match(site, /how many Private entries and photos you have, how much space they take,/);
});
