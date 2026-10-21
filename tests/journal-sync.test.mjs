import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { mergeJournalMutation, reconcileJournalSync, synchronizeJournal } from '../src/data/journal-sync.ts';
import { missingFiles } from './support/fake-media-cache.mjs';
import { db, supabase } from './support/fake-supabase.mjs';

const userId = '00000000-0000-4000-8000-000000000001';
const capturedAt = '2026-09-20T08:00:00.000Z';
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

function journal(entries, pending) {
  return { entries, expandedSectionIds: ['home'], pending, syncIssues: [], trips: [], version: 1 };
}

async function syncOnce(entries, pending) {
  return synchronizeJournal(userId, journal(entries, pending));
}

function conflictCopies() {
  return db.rows('entries').filter((row) => row.title.endsWith('(conflict copy)'));
}

beforeEach(() => {
  db.reset();
  missingFiles.clear();
});

test('repeated edits collapse into one queued upsert that keeps the original base version', () => {
  const first = entry({ syncVersion: 3 });
  const queued = mergeJournalMutation([upsert(first)], upsert({ ...first, title: 'Edited', syncVersion: 4 }));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].baseVersion, 3);
  assert.equal(queued[0].entry.title, 'Edited');
});

test('a delete replaces a queued upsert for the same entry', () => {
  const value = entry({ syncVersion: 2 });
  const queued = mergeJournalMutation([upsert(value)], {
    baseVersion: 2,
    entityId: value.id,
    kind: 'entry-delete',
    mutationId: uuid(),
  });
  assert.deepEqual(
    queued.map((mutation) => mutation.kind),
    ['entry-delete'],
  );
});

test('edits made while a sync is running are kept after reconciliation', () => {
  const synced = entry({ syncVersion: 1 });
  const snapshot = journal([synced], [upsert(synced)]);
  const result = journal([{ ...synced, syncVersion: 2 }], []);
  const newer = upsert({ ...synced, title: 'Typed during sync' }, 0);
  const current = journal([{ ...synced, title: 'Typed during sync' }], [...snapshot.pending, newer]);

  const reconciled = reconcileJournalSync(current, snapshot, result);
  assert.equal(reconciled.pending.length, 1);
  assert.equal(reconciled.pending[0].baseVersion, 2);
  assert.equal(reconciled.entries[0].title, 'Typed during sync');
});

test('a new entry is inserted with its To-Dos and the queue empties', async () => {
  const value = entry({
    sectionId: 'todo',
    todoItems: [{ completed: false, dueTag: '@2026-09-27', id: uuid(), text: 'Plan the week' }],
  });
  const result = await syncOnce([value], [upsert(value)]);

  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.syncIssues, []);
  assert.equal(db.rows('entries').length, 1);
  assert.equal(db.rows('todo_items')[0].due_tag, '@2026-09-27');
  assert.equal(result.entries[0].syncVersion, 1);
});

test('retrying a create whose first response was lost updates instead of failing with 23505', async () => {
  const value = entry();
  await syncOnce([value], [upsert(value)]);
  // The device never received the first response, so it still holds baseVersion 0.
  const result = await syncOnce([value], [upsert({ ...value, title: 'Retried' }, 0)]);

  assert.deepEqual(result.syncIssues, []);
  assert.equal(db.rows('entries').length, 1);
  assert.equal(db.rows('entries')[0].title, 'Retried');
});

test('an edit based on an outdated version becomes a conflict copy and keeps both versions', async () => {
  const value = entry();
  const first = await syncOnce([value], [upsert(value)]);
  const synced = first.entries[0];
  await supabase.from('entries').update({ title: 'Edited on iPad' }).eq('id', value.id);

  const result = await syncOnce([synced], [upsert({ ...synced, title: 'Edited on iPhone' })]);

  assert.equal(result.syncIssues[0].kind, 'conflict');
  assert.deepEqual(
    db
      .rows('entries')
      .map((row) => row.title)
      .sort(),
    ['Edited on iPad', 'Edited on iPhone (conflict copy)'],
  );
});

test('retrying an edit whose response was lost does not create a conflict copy', async () => {
  const value = entry({
    body: { content: [{ content: [{ text: 'Body', type: 'text' }], type: 'paragraph' }], type: 'doc' },
  });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const edited = {
    ...synced,
    latitude: 42.66,
    locationLabel: 'Prishtina',
    longitude: 21.16,
    title: 'Edited on iPhone',
  };
  const mutation = upsert(edited);
  await syncOnce([edited], [mutation]);
  // The save reached the server, but the phone never got the reply, so it retries from the old version.
  const retried = await syncOnce([edited], [mutation]);

  assert.deepEqual(retried.syncIssues, []);
  assert.deepEqual(retried.pending, []);
  assert.deepEqual(conflictCopies(), []);
  assert.deepEqual(
    db.rows('entries').map((row) => row.title),
    ['Edited on iPhone'],
  );
  assert.equal(retried.entries[0].syncVersion, db.rows('entries')[0].sync_version);
});

test('a lost reply followed by a change on another device still keeps both versions', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const mutation = upsert({ ...synced, title: 'Edited on iPhone' });
  await syncOnce([synced], [mutation]);
  await supabase.from('entries').update({ title: 'Edited on iPad' }).eq('id', value.id);
  const retried = await syncOnce([synced], [mutation]);

  assert.equal(retried.syncIssues[0].kind, 'conflict');
  assert.deepEqual(
    db
      .rows('entries')
      .map((row) => row.title)
      .sort(),
    ['Edited on iPad', 'Edited on iPhone (conflict copy)'],
  );
});

test('a lost reply followed by a To-Do change on another device still keeps both versions', async () => {
  const value = entry({ todoItems: [{ completed: false, dueTag: null, id: uuid(), text: 'Buy milk' }] });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const mutation = upsert({ ...synced, title: 'Edited on iPhone' });
  await syncOnce([synced], [mutation]);
  // The iPad ticks the To-Do: its sync re-saves the unchanged row (one more version) and the To-Do.
  const onIpad = db.rows('entries')[0];
  await syncOnce(
    [
      {
        ...synced,
        syncVersion: onIpad.sync_version,
        title: onIpad.title,
        todoItems: [{ ...value.todoItems[0], completed: true }],
      },
    ],
    [
      upsert({
        ...synced,
        syncVersion: onIpad.sync_version,
        title: onIpad.title,
        todoItems: [{ ...value.todoItems[0], completed: true }],
      }),
    ],
  );
  const retried = await syncOnce([synced], [mutation]);

  assert.equal(retried.syncIssues[0].kind, 'conflict');
  assert.equal(
    db.rows('todo_items').filter((row) => row.entry_id === value.id)[0].completed,
    true,
    "the iPad's tick is kept",
  );
  assert.equal(conflictCopies().length, 1);
});

test('a failed photo upload keeps the change queued with a useful error', async () => {
  const value = entry({ attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo-1.jpg' }] });
  db.failUploads = true;
  const result = await syncOnce([value], [upsert(value)]);

  assert.equal(result.pending.length, 1);
  assert.equal(result.syncIssues[0].kind, 'error');
  assert.match(result.syncIssues[0].message, /network connection was lost/);
});

test('a photo past the account limit stays queued and the sync issue says why (2026-10-08)', async () => {
  const value = entry({ attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo-501.jpg' }] });
  // Storage's answer when the photo limit refuses an upload (checked on a local Supabase).
  db.failUploads = Object.assign(new Error('new row violates row-level security policy'), {
    name: 'StorageApiError',
    status: 400,
    statusCode: '403',
  });
  const result = await syncOnce([value], [upsert(value)]);

  assert.equal(result.pending.length, 1);
  assert.match(
    result.syncIssues[0].message,
    /^Could not sync this journal entry\. Storage limit reached: an account can keep up to 500 photos or 250 MB of photos\./,
  );
  assert.match(result.syncIssues[0].message, /It remains safely stored on this device\.$/);
});

test('retrying an existing entry after an interrupted photo upload does not create a conflict copy', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const withPhoto = { ...synced, attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo-1.jpg' }] };

  db.failUploads = true;
  const failed = await syncOnce([withPhoto], [upsert(withPhoto)]);
  db.failUploads = false;
  const retried = await syncOnce(failed.entries, failed.pending);

  assert.deepEqual(retried.pending, []);
  assert.deepEqual(conflictCopies(), []);
  assert.equal(db.rows('entry_media').length, 1);
});

test('repeated retries on a failing upload never multiply conflict copies', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  let state = journal(
    [{ ...synced, attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///big.jpg' }] }],
    [],
  );
  state.pending = [upsert(state.entries[0])];

  db.failUploads = true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    state = await synchronizeJournal(userId, state);
  }
  assert.deepEqual(conflictCopies(), []);
  assert.equal(state.pending.length, 1);

  db.failUploads = false;
  state = await synchronizeJournal(userId, state);
  assert.deepEqual(state.pending, []);
  assert.equal(db.rows('entry_media').length, 1);
});

test('replacing the cover photo of a synced entry syncs without an error or conflict copy', async () => {
  const value = entry({ coverMediaId: uuid(), coverMimeType: 'image/jpeg', coverUri: 'file:///cover-1.jpg' });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const replaced = { ...synced, coverMediaId: uuid(), coverStoragePath: null, coverUri: 'file:///cover-2.jpg' };

  const result = await syncOnce([replaced], [upsert(replaced)]);

  assert.deepEqual(result.syncIssues, []);
  assert.deepEqual(conflictCopies(), []);
  const covers = db.rows('entry_media').filter((row) => row.is_cover);
  assert.equal(covers.length, 1);
  assert.equal(covers[0].id, replaced.coverMediaId);
});

test('a real conflict followed by a failed upload keeps exactly one conflict copy across retries', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  await supabase.from('entries').update({ title: 'Edited on iPad' }).eq('id', value.id);
  const offline = {
    ...synced,
    attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo.jpg' }],
    title: 'Edited on iPhone',
  };
  let state = journal([offline], [upsert(offline)]);

  db.failUploads = true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    state = await synchronizeJournal(userId, state);
  }
  db.failUploads = false;
  state = await synchronizeJournal(userId, state);

  assert.deepEqual(state.pending, []);
  assert.equal(conflictCopies().length, 1);
  assert.equal(db.rows('entry_media').filter((row) => row.entry_id === conflictCopies()[0].id).length, 1);
});

test('editing an entry again while its previous change is syncing does not create a conflict copy', async () => {
  const value = entry({ sectionId: 'todo', todoItems: [{ completed: false, dueTag: null, id: uuid(), text: 'Milk' }] });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  const firstTick = { ...synced, todoItems: [{ ...synced.todoItems[0], completed: true }] };
  const snapshot = journal([firstTick], [upsert(firstTick)]);
  const result = await synchronizeJournal(userId, snapshot);

  // The second tick was made during that sync, from the same pre-sync version.
  const secondTick = { ...firstTick, todoItems: [{ ...firstTick.todoItems[0], completed: false }] };
  const current = journal([secondTick], [...snapshot.pending, upsert(secondTick, synced.syncVersion)]);
  const next = await synchronizeJournal(userId, reconcileJournalSync(current, snapshot, result));

  assert.deepEqual(next.pending, []);
  assert.deepEqual(conflictCopies(), []);
  assert.equal(db.rows('todo_items')[0].completed, false);
});

test('an edit made during a sync never overwrites a change from another device', async () => {
  const value = entry();
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  await supabase.from('entries').update({ title: 'Edited on iPad' }).eq('id', value.id);
  const snapshot = journal(
    [{ ...synced, title: 'First iPhone edit' }],
    [upsert({ ...synced, title: 'First iPhone edit' })],
  );
  const result = await synchronizeJournal(userId, snapshot);
  const current = journal(
    [{ ...synced, title: 'Second iPhone edit' }],
    [...snapshot.pending, upsert({ ...synced, title: 'Second iPhone edit' }, synced.syncVersion)],
  );
  await synchronizeJournal(userId, reconcileJournalSync(current, snapshot, result));

  assert.ok(db.rows('entries').some((row) => row.title === 'Edited on iPad'));
});

test('deleting a synced entry removes its row, media rows and files, and records a tombstone', async () => {
  const value = entry({ attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo.jpg' }] });
  const synced = (await syncOnce([value], [upsert(value)])).entries[0];
  assert.equal(db.storage.size, 1);

  const result = await syncOnce(
    [],
    [{ baseVersion: synced.syncVersion, entityId: value.id, kind: 'entry-delete', mutationId: uuid() }],
  );

  assert.deepEqual(result.pending, []);
  assert.equal(db.rows('entries').length, 0);
  assert.equal(db.rows('entry_media').length, 0);
  assert.equal(db.storage.size, 0);
  assert.equal(db.rows('sync_tombstones')[0].entity_id, value.id);
});

test('a photo copy cleared from this device is downloaded again on the next sync', async () => {
  const value = entry({ attachments: [{ createdAt: capturedAt, id: uuid(), uri: 'file:///photo-1.jpg' }] });
  const synced = await syncOnce([value], [upsert(value)]);
  assert.equal(synced.entries[0].attachments[0].uri, 'file:///photo-1.jpg');

  missingFiles.add('file:///photo-1.jpg');
  const again = await syncOnce(synced.entries, []);

  assert.equal(again.entries[0].attachments[0].uri, `cached://${synced.entries[0].attachments[0].storagePath}`);
});
