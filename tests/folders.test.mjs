import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { synchronizeJournal } from '../src/data/journal-sync.ts';
import {
  defaultFolders,
  folderFromRow,
  isDeletableFolder,
  normalizeRetiredEntry,
  resolveEntryFolderId,
  tripContainingDate,
} from '../src/domain/journal.ts';
import { db } from './support/fake-supabase.mjs';

const userId = '00000000-0000-4000-8000-0000000000c1';
const workFolderId = '00000000-0000-4000-8000-0000000000c2';
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
    title: 'Entry',
    todoItems: [],
    updatedAt: '2026-09-20T08:00:00.000Z',
    ...overrides,
  };
}

const upsert = (value, baseVersion = value.syncVersion ?? 0) => ({
  baseVersion,
  entityId: value.id,
  entry: value,
  kind: 'entry-upsert',
  mutationId: uuid(),
});
const journal = (entries, pending, extra = {}) => ({
  entries,
  expandedSectionIds: [],
  folders: defaultFolders,
  pending,
  syncIssues: [],
  trips: [],
  version: 1,
  ...extra,
});
const createWork = () => ({
  entityId: workFolderId,
  folder: { emoji: '💼', name: 'Work', position: 6 },
  kind: 'folder-create',
  mutationId: uuid(),
});
const sectionRow = (key) => db.rows('journal_sections').find((row) => row.built_in_key === key);

beforeEach(() => db.reset());

test('the default folders are Notes, Private, To-Do, Finance, Fitness, and Thoughts', () => {
  assert.deepEqual(
    defaultFolders.map((folder) => `${folder.emoji} ${folder.name}`),
    ['📝 Notes', '🔒 Private', '✅ To-Do', '💰 Finance', '💪 Fitness', '🧠 Thoughts'],
  );
  assert.equal(isDeletableFolder('home'), false);
  assert.equal(isDeletableFolder('private'), false);
  assert.equal(isDeletableFolder('fitness'), true);
  assert.equal(isDeletableFolder(workFolderId), true);
});

test('stored folders map to what the app shows, and retired ones are hidden', () => {
  assert.deepEqual(folderFromRow({ built_in_key: 'home', emoji: '🏠', id: 'row-1', name: 'Home', position: 0 }), {
    builtInKey: 'home',
    emoji: '📝',
    id: 'home',
    locked: undefined,
    name: 'Notes',
    position: 0,
  });
  assert.equal(
    folderFromRow({ built_in_key: 'thoughts', emoji: '🧠', id: 'row-2', name: 'Random Thoughts', position: 5 }).name,
    'Thoughts',
  );
  assert.equal(folderFromRow({ built_in_key: 'travel', emoji: '✈️', id: 'row-3', name: 'Travel', position: 6 }), null);
  assert.equal(
    folderFromRow({ built_in_key: null, emoji: '💼', id: workFolderId, name: 'Work', position: 6 }).id,
    workFolderId,
  );
});

test('entries without a known folder go to Notes', () => {
  assert.equal(resolveEntryFolderId('fitness', defaultFolders), 'fitness');
  assert.equal(resolveEntryFolderId('travel', defaultFolders), 'home');
  assert.equal(resolveEntryFolderId(workFolderId, defaultFolders), 'home');
  assert.equal(resolveEntryFolderId('private', defaultFolders), 'private');
  assert.deepEqual(normalizeRetiredEntry(entry({ id: 'e', sectionId: 'travel' })), {
    ...entry({ id: 'e', sectionId: 'home' }),
    id: 'e',
    legacyTravel: true,
  });
  assert.equal(normalizeRetiredEntry(entry({ sectionId: 'other' })).sectionId, 'home');
});

test('a single trip covering a date is found; overlapping trips are not guessed', () => {
  const rome = { destination: 'Rome', emoji: '🇮🇹', endDate: '2026-09-22', id: 't1', startDate: '2026-09-18' };
  const paris = { destination: 'Paris', emoji: '🇫🇷', endDate: '2026-09-21', id: 't2', startDate: '2026-09-20' };
  assert.equal(tripContainingDate([rome], '2026-09-20T08:00:00.000Z')?.id, 't1');
  assert.equal(tripContainingDate([rome, paris], '2026-09-20T08:00:00.000Z'), undefined);
  assert.equal(tripContainingDate([rome], '2026-10-01T08:00:00.000Z'), undefined);
});

test('a new folder and an entry in it sync, and come back as a folder the app shows', async () => {
  const value = entry({ sectionId: workFolderId });
  const result = await synchronizeJournal(userId, journal([value], [createWork(), upsert(value)]));

  assert.deepEqual(result.pending, []);
  const workRow = db.rows('journal_sections').find((row) => row.id === workFolderId);
  assert.equal(workRow.built_in_key, null);
  assert.equal(db.rows('entries')[0].section_id, workFolderId);
  assert.equal(result.entries[0].sectionId, workFolderId);
  assert.ok(result.folders.some((folder) => folder.id === workFolderId && folder.name === 'Work'));
});

test('deleting a folder moves its entries to Notes and then removes the folder', async () => {
  const value = entry({ sectionId: workFolderId });
  const created = await synchronizeJournal(userId, journal([value], [createWork(), upsert(value)]));
  const moved = { ...created.entries[0], sectionId: 'home' };

  const result = await synchronizeJournal(
    userId,
    journal([moved], [upsert(moved), { entityId: workFolderId, kind: 'folder-delete', mutationId: uuid() }], {
      folders: created.folders,
    }),
  );

  assert.deepEqual(result.pending, []);
  assert.equal(
    db.rows('journal_sections').some((row) => row.id === workFolderId),
    false,
  );
  assert.equal(db.rows('entries').length, 1);
  assert.equal(db.rows('entries')[0].section_id, sectionRow('home').id);
  assert.equal(
    result.folders.some((folder) => folder.id === workFolderId),
    false,
  );
});

test('a folder that still has entries on the server is never deleted', async () => {
  const value = entry({ sectionId: workFolderId });
  await synchronizeJournal(userId, journal([value], [createWork(), upsert(value)]));

  const result = await synchronizeJournal(
    userId,
    journal([], [{ entityId: workFolderId, kind: 'folder-delete', mutationId: uuid() }]),
  );

  assert.equal(result.pending.length, 1);
  assert.match(result.syncIssues[0].message, /still has entries/);
  assert.ok(db.rows('journal_sections').some((row) => row.id === workFolderId));
  assert.equal(db.rows('entries').length, 1);
  assert.equal(
    result.folders.some((folder) => folder.id === workFolderId),
    false,
    'the pending delete stays hidden locally',
  );
});

test('Notes and Private can never be deleted', async () => {
  const result = await synchronizeJournal(
    userId,
    journal([], [{ entityId: 'home', kind: 'folder-delete', mutationId: uuid() }]),
  );
  assert.match(result.syncIssues[0].message, /cannot be deleted/);
  assert.ok(sectionRow('home'));
});

test('an entry whose folder was deleted on another device is saved to Notes', async () => {
  const value = entry({ sectionId: workFolderId });
  const result = await synchronizeJournal(userId, journal([value], [upsert(value)]));

  assert.deepEqual(result.pending, []);
  assert.equal(db.rows('entries')[0].section_id, sectionRow('home').id);
  assert.equal(result.entries[0].sectionId, 'home');
});

test('old Travel entries show in Notes and move there, linked to their trip, when saved', async () => {
  await synchronizeJournal(userId, journal([], []));
  db.rows('journal_sections').push({
    built_in_key: 'travel',
    collapsed: false,
    emoji: '✈️',
    id: 'section-travel',
    is_private: false,
    name: 'Travel',
    position: 6,
    sync_version: 1,
    user_id: userId,
  });
  db.rows('trips').push({
    destination: 'Rome',
    emoji: '🇮🇹',
    end_date: '2026-09-22',
    id: 'trip-rome',
    start_date: '2026-09-18',
    sync_version: 1,
    updated_at: '2026-09-18T00:00:00.000Z',
    user_id: userId,
  });
  db.rows('entries').push({
    body: { content: [], type: 'doc' },
    description: null,
    entry_date: '2026-09-20T08:00:00.000Z',
    favorite: false,
    id: 'entry-travel',
    is_private: false,
    latitude: null,
    location_label: null,
    longitude: null,
    mood: null,
    plain_text: 'Colosseum',
    reviewed: false,
    section_id: 'section-travel',
    sync_version: 1,
    title: 'Rome day 3',
    trip_id: null,
    updated_at: '2026-09-20T08:00:00.000Z',
    user_id: userId,
  });

  const pulled = await synchronizeJournal(userId, journal([], []));
  const travelEntry = pulled.entries.find((item) => item.id === 'entry-travel');
  assert.equal(travelEntry.sectionId, 'home');
  assert.equal(travelEntry.legacyTravel, true);
  assert.equal(
    pulled.folders.some((folder) => folder.id === 'travel'),
    false,
  );

  const favorite = { ...travelEntry, favorite: true };
  await synchronizeJournal(userId, journal([favorite], [upsert(favorite)], { trips: pulled.trips }));
  const row = db.rows('entries').find((item) => item.id === 'entry-travel');
  assert.equal(row.section_id, sectionRow('home').id);
  assert.equal(row.trip_id, 'trip-rome');
});

test('only Notes and Private are recreated when missing, so deleted folders stay deleted', async () => {
  await synchronizeJournal(userId, journal([], []));
  assert.deepEqual(
    db
      .rows('journal_sections')
      .map((row) => row.built_in_key)
      .sort(),
    ['home', 'private'],
  );
});
