import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatBytes, isDownloadedCopy, unusedDownloadedCopies } from '../src/domain/media-cleanup.ts';

const userId = '00000000-0000-4000-8000-000000000001';
// Names as the app writes them: downloaded copies from the storage path, picked photos from their id.
const downloaded = (id) => ({
  name: `${userId}_entries_entry-1_${id}.jpg.jpg`,
  size: 1000,
  uri: `file:///docs/journal-media/${userId}/${userId}_entries_entry-1_${id}.jpg.jpg`,
});
const picked = {
  name: '6f1c2d3e-0000-4000-8000-000000000009.jpg',
  size: 5000,
  uri: `file:///docs/journal-media/${userId}/6f1c2d3e-0000-4000-8000-000000000009.jpg`,
};

test('only copies downloaded from the account count as downloaded', () => {
  assert.equal(isDownloadedCopy(downloaded('photo-1').name), true);
  assert.equal(isDownloadedCopy(picked.name), false);
});

test('copies a note still shows, and photos picked on this device, are never cleared', () => {
  const inUse = downloaded('in-use');
  const unused = downloaded('from-a-deleted-note');
  // The app may refer to the same file with or without "/private" in front of the path.
  const usedUris = [inUse.uri.replace('file:///docs', 'file:///private/docs'), picked.uri, null, undefined];

  assert.deepEqual(unusedDownloadedCopies([inUse, unused, picked], usedUris), [unused]);
  // Nothing in use: still only the downloaded copies, never the picked photo.
  assert.deepEqual(unusedDownloadedCopies([inUse, picked], []), [inUse]);
});

test('freed space reads in KB or MB', () => {
  assert.equal(formatBytes(300), '1 KB');
  assert.equal(formatBytes(512 * 1024), '512 KB');
  assert.equal(formatBytes(4.2 * 1024 * 1024), '4.2 MB');
});
