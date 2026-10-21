import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appStoreLinks } from '../src/config/app-store.ts';

test('Share and Rate stay hidden until the app has an App Store ID', () => {
  assert.equal(appStoreLinks(null), null);
  assert.equal(appStoreLinks(''), null);
  assert.equal(appStoreLinks('not-an-id'), null);
});

test('an App Store ID gives the listing and the write-a-review links', () => {
  assert.deepEqual(appStoreLinks('1234567890'), {
    listing: 'https://apps.apple.com/app/id1234567890',
    review: 'itms-apps://itunes.apple.com/app/id1234567890?action=write-review',
  });
});
