import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { queuePermanentDeletes, synchronizeJournal } from '../src/data/journal-sync.ts';
import { removePrivateRecords, synchronizePrivateJournal } from '../src/data/private-sync.ts';
import {
  deletedDaysLeft,
  deletedDaysLeftLabel,
  deletedEntries,
  expiredIds,
  isExpired,
  liveEntries,
} from '../src/domain/recently-deleted.ts';
import { db } from './support/fake-supabase.mjs';

const userId = '00000000-0000-4000-8000-0000000000dd';
const day = 24 * 60 * 60 * 1000;
let sequence = 0;

function uuid() {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function entry(overrides = {}) {
  return {
    attachments: [],
    body: { content: [], type: 'doc' },
    coverUri: null,
    createdAt: '2026-09-20T08:00:00.000Z',
    description: '',
    favorite: false,
    id: uuid(),
    latitude: null,
    locationLabel: null,
    longitude: null,
    mood: null,
    plainText: 'Body',
    reviewed: false,
    sectionId: 'home',
    syncVersion: 0,
    title: 'Morning pages',
    todoItems: [],
    updatedAt: '2026-09-20T08:00:00.000Z',
    ...overrides,
  };
}

function upsert(value, baseVersion = value.syncVersion ?? 0) {
  return { baseVersion, entityId: value.id, entry: value, kind: 'entry-upsert', mutationId: uuid() };
}

function syncOnce(entries, pending) {
  return synchronizeJournal(userId, {
    entries,
    expandedSectionIds: ['home'],
    pending,
    syncIssues: [],
    trips: [],
    version: 1,
  });
}

beforeEach(() => db.reset());

test('an entry has 30 days left right after deleting, 1 on its last day, and then expires', () => {
  const deletedAt = '2026-10-01T12:00:00.000Z';
  const deleted = Date.parse(deletedAt);
  assert.equal(deletedDaysLeft(deletedAt, new Date(deleted + 60_000)), 30);
  assert.equal(deletedDaysLeft(deletedAt, new Date(deleted + 29 * day + 60_000)), 1);
  assert.equal(isExpired(deletedAt, new Date(deleted + 30 * day - 60_000)), false);
  assert.equal(isExpired(deletedAt, new Date(deleted + 30 * day)), true);
  assert.equal(deletedDaysLeft(deletedAt, new Date(deleted + 31 * day)), 0);
  assert.equal(isExpired(null), false);
});

test('the days-left label counts down and ends with Deleted soon', () => {
  const deletedAt = '2026-10-01T12:00:00.000Z';
  const deleted = Date.parse(deletedAt);
  assert.equal(deletedDaysLeftLabel(deletedAt, new Date(deleted + 60_000)), '30 days left');
  assert.equal(deletedDaysLeftLabel(deletedAt, new Date(deleted + 29 * day + 60_000)), '1 day left');
  assert.equal(deletedDaysLeftLabel(deletedAt, new Date(deleted + 30 * day)), 'Deleted soon');
});

test('deleted entries are left out of the live list and listed most recently deleted first', () => {
  const kept = entry();
  const older = entry({ deletedAt: '2026-09-25T08:00:00.000Z' });
  const newer = entry({ deletedAt: '2026-09-28T08:00:00.000Z' });
  const restored = entry({ deletedAt: null });

  assert.deepEqual(
    liveEntries([older, kept, newer, restored]).map((item) => item.id),
    [kept.id, restored.id],
  );
  assert.deepEqual(
    deletedEntries([older, kept, newer]).map((item) => item.id),
    [newer.id, older.id],
  );
});

test('deleting a synced entry keeps its row, photos and To-Dos with the server deletion time, and restoring clears it', async () => {
  const value = entry({
    attachments: [{ createdAt: '2026-09-20T08:00:00.000Z', id: uuid(), uri: 'file:///photo.jpg' }],
  });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];

  // The phone's clock is far off; the server's time is used instead.
  const deleted = { ...synced, deletedAt: '2001-01-01T00:00:00.000Z' };
  const afterDelete = await syncOnce([deleted], [upsert(deleted)]);

  assert.deepEqual(afterDelete.pending, []);
  assert.equal(afterDelete.syncIssues.length, 0);
  const row = db.rows('entries')[0];
  assert.ok(Date.parse(row.deleted_at) > Date.parse('2026-01-01T00:00:00.000Z'));
  assert.equal(afterDelete.entries[0].deletedAt, row.deleted_at);
  assert.equal(db.rows('entry_media').length, 1);
  assert.equal(db.storage.size, 1);
  assert.equal(db.rows('sync_tombstones').length, 0);

  const restored = { ...afterDelete.entries[0], deletedAt: null };
  const afterRestore = await syncOnce([restored], [upsert(restored)]);
  assert.equal(db.rows('entries')[0].deleted_at, null);
  assert.equal(afterRestore.entries[0].deletedAt, null);
});

test('saving an entry that is already deleted keeps its first deletion time', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const deleted = (
    await syncOnce(
      [{ ...synced, deletedAt: '2026-10-01T00:00:00.000Z' }],
      [upsert({ ...synced, deletedAt: '2026-10-01T00:00:00.000Z' })],
    )
  ).entries[0];
  const firstTime = db.rows('entries')[0].deleted_at;

  const edited = { ...deleted, deletedAt: '2026-10-05T00:00:00.000Z', title: 'Renamed while deleted' };
  await syncOnce([edited], [upsert(edited)]);

  assert.equal(db.rows('entries')[0].deleted_at, firstTime);
  assert.equal(db.rows('entries')[0].title, 'Renamed while deleted');
});

test('retrying a deletion whose response was lost does not create a conflict copy', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  await syncOnce([deleted], [upsert(deleted)]);

  // The device never heard back, so it still holds the version from before the deletion.
  const result = await syncOnce([deleted], [upsert(deleted, synced.syncVersion)]);

  assert.deepEqual(result.pending, []);
  assert.equal(db.rows('entries').length, 1);
  assert.equal(result.syncIssues.length, 0);
});

test('an offline deletion of an entry edited on another device keeps the edit and puts a copy in Recently Deleted', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const elsewhere = { ...synced, title: 'Edited on iPad' };
  await syncOnce([elsewhere], [upsert(elsewhere)]);

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  const result = await syncOnce([deleted], [upsert(deleted, synced.syncVersion)]);

  const original = db.rows('entries').find((row) => row.id === value.id);
  const copy = db.rows('entries').find((row) => row.id !== value.id);
  assert.equal(original.title, 'Edited on iPad');
  assert.equal(original.deleted_at ?? null, null);
  assert.ok(copy.title.endsWith('(conflict copy)'));
  assert.ok(copy.deleted_at);
  assert.equal(result.syncIssues.filter((issue) => issue.kind === 'conflict').length, 1);
});

test('a deleted Private entry sends only its deletion time next to the unchanged ciphertext', async () => {
  db.rows('journal_sections').push({
    built_in_key: 'private',
    collapsed: false,
    id: 'section-private',
    is_private: true,
    user_id: userId,
  });
  const record = {
    ciphertext: 'c2VhbGVk',
    createdAt: '2026-09-20T08:00:00.000Z',
    id: uuid(),
    nonce: 'bm9uY2U=',
    syncVersion: 0,
    updatedAt: '2026-09-20T08:00:00.000Z',
    version: 1,
  };
  const first = await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: 0, kind: 'upsert', mutationId: uuid(), record }],
    records: [record],
    syncIssues: [],
    version: 1,
  });
  const synced = first.records[0];

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  const result = await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: synced.syncVersion, kind: 'upsert', mutationId: uuid(), record: deleted }],
    records: [deleted],
    syncIssues: [],
    version: 1,
  });

  const row = db.rows('entries')[0];
  assert.ok(row.deleted_at);
  assert.equal(row.private_payload_ciphertext, record.ciphertext);
  for (const column of ['body', 'description', 'plain_text', 'title']) assert.equal(row[column], undefined);
  assert.equal(result.records[0].deletedAt, row.deleted_at);
  assert.deepEqual(result.pending, []);
});

test('only entries deleted more than 30 days ago are picked for the cleanup', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const items = [
    { deletedAt: '2026-10-01T00:00:00.000Z', id: 'old' },
    { deletedAt: '2026-11-01T00:00:00.000Z', id: 'recent' },
    { deletedAt: null, id: 'live' },
  ];
  assert.deepEqual(expiredIds(items, now), ['old']);
});

test('Delete now after an unsynced move to Recently Deleted leaves one delete at the original version', () => {
  const value = entry({ deletedAt: '2026-10-01T00:00:00.000Z', syncVersion: 3 });
  const state = {
    entries: [value],
    expandedSectionIds: ['home'],
    pending: [upsert(value, 3)],
    syncIssues: [],
    trips: [],
    version: 1,
  };

  const next = queuePermanentDeletes(state, [value.id]);

  assert.deepEqual(next.entries, []);
  assert.equal(next.pending.length, 1);
  assert.equal(next.pending[0].kind, 'entry-delete');
  assert.equal(next.pending[0].baseVersion, 3);
});

test('Delete now of an entry that never reached the server only drops its queued upload', () => {
  const value = entry({ deletedAt: '2026-10-01T00:00:00.000Z' });
  const state = {
    entries: [value],
    expandedSectionIds: ['home'],
    pending: [upsert(value, 0)],
    syncIssues: [],
    trips: [],
    version: 1,
  };

  const next = queuePermanentDeletes(state, [value.id]);

  assert.deepEqual(next.entries, []);
  assert.deepEqual(next.pending, []);
  assert.equal(queuePermanentDeletes(state, ['unknown-id']), state);
});

test('deleting a Private record for good replaces its queued change, or drops one never uploaded', () => {
  const synced = {
    ciphertext: 'c',
    createdAt: '2026-09-20T08:00:00.000Z',
    deletedAt: '2026-10-01T00:00:00.000Z',
    id: uuid(),
    nonce: 'n',
    syncVersion: 4,
    updatedAt: '2026-10-01T00:00:00.000Z',
    version: 1,
  };
  const fresh = { ...synced, id: uuid(), syncVersion: 0 };
  const journal = {
    pending: [
      { baseVersion: 4, kind: 'upsert', mutationId: uuid(), record: synced },
      { baseVersion: 0, kind: 'upsert', mutationId: uuid(), record: fresh },
    ],
    records: [synced, fresh],
    syncIssues: [],
    version: 1,
  };

  const next = removePrivateRecords(journal, [synced, fresh]);

  assert.deepEqual(next.records, []);
  assert.deepEqual(
    next.pending.map((mutation) => [mutation.kind, mutation.entryId, mutation.baseVersion]),
    [['delete', synced.id, 4]],
  );
  assert.equal(removePrivateRecords(journal, [{ id: 'unknown-id' }]), journal);
});

function summary(periodStart, periodEnd) {
  return { id: uuid(), period_end: periodEnd, period_start: periodStart, summary: {}, user_id: userId };
}

test('moving an entry to Recently Deleted removes the weekly summaries written from its week', async () => {
  const value = entry({ createdAt: '2026-09-20T08:00:00.000Z' });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  db.rows('weekly_summaries').push(
    summary('2026-09-14', '2026-09-20'),
    summary('2026-09-21', '2026-09-27'),
    summary('2026-08-31', '2026-09-06'),
  );

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  await syncOnce([deleted], [upsert(deleted)]);

  assert.deepEqual(
    db
      .rows('weekly_summaries')
      .map((row) => row.period_start)
      .sort(),
    ['2026-08-31', '2026-09-21'],
  );
});

test("an entry just after a week boundary removes only the summary of its own UTC day's week", async () => {
  const value = entry({ createdAt: '2026-09-21T00:30:00.000Z' });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  db.rows('weekly_summaries').push(summary('2026-09-14', '2026-09-20'), summary('2026-09-21', '2026-09-27'));

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  await syncOnce([deleted], [upsert(deleted)]);

  assert.deepEqual(
    db.rows('weekly_summaries').map((row) => row.period_start),
    ['2026-09-14'],
  );
});

test('deleting an entry for good also removes the weekly summaries written from its week', async () => {
  const value = entry({ createdAt: '2026-09-20T08:00:00.000Z' });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  db.rows('weekly_summaries').push(summary('2026-09-14', '2026-09-20'), summary('2026-08-31', '2026-09-06'));

  await syncOnce(
    [],
    [{ baseVersion: synced.syncVersion, entityId: value.id, kind: 'entry-delete', mutationId: uuid() }],
  );

  assert.deepEqual(
    db.rows('weekly_summaries').map((row) => row.period_start),
    ['2026-08-31'],
  );
});

test('moving to Recently Deleted an entry already deleted for good elsewhere leaves nothing behind', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  db.tables.entries = [];

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  const result = await syncOnce([deleted], [upsert(deleted)]);

  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.entries, []);
  assert.equal(db.rows('entries').length, 0);
  assert.equal(result.syncIssues.length, 0);
});

test('editing an entry deleted for good elsewhere keeps the edit as a copy and says it was deleted', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  db.tables.entries = [];

  const edited = { ...synced, title: 'Still writing' };
  const result = await syncOnce([edited], [upsert(edited)]);

  assert.equal(db.rows('entries').length, 1);
  assert.equal(db.rows('entries')[0].title, 'Still writing (conflict copy)');
  assert.match(result.syncIssues[0].message, /was deleted on another device/);
});

test('moving to Recently Deleted a Private entry already deleted for good leaves nothing behind', async () => {
  db.rows('journal_sections').push({
    built_in_key: 'private',
    collapsed: false,
    id: 'section-private',
    is_private: true,
    user_id: userId,
  });
  const record = {
    ciphertext: 'c2VhbGVk',
    createdAt: '2026-09-20T08:00:00.000Z',
    id: uuid(),
    nonce: 'bm9uY2U=',
    syncVersion: 0,
    updatedAt: '2026-09-20T08:00:00.000Z',
    version: 1,
  };
  const synced = (
    await synchronizePrivateJournal(userId, {
      pending: [{ baseVersion: 0, kind: 'upsert', mutationId: uuid(), record }],
      records: [record],
      syncIssues: [],
      version: 1,
    })
  ).records[0];
  db.tables.entries = [];

  const deleted = { ...synced, deletedAt: '2026-10-01T00:00:00.000Z' };
  const result = await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: synced.syncVersion, kind: 'upsert', mutationId: uuid(), record: deleted }],
    records: [deleted],
    syncIssues: [],
    version: 1,
  });

  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.records, []);
  assert.equal(db.rows('entries').length, 0);
  assert.equal(result.syncIssues.length, 0);
});
