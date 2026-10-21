import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { synchronizeJournal } from '../src/data/journal-sync.ts';
import { reconcilePrivateSync, synchronizePrivateJournal } from '../src/data/private-sync.ts';
import { journalExportHtml } from '../src/lib/export/export-data.ts';
import { db } from './support/fake-supabase.mjs';

const userId = '00000000-0000-4000-8000-0000000000aa';
const secret = 'PRIVATE-SECRET-TEXT';

function entry(id, sectionId, text) {
  return {
    attachments: [],
    body: { content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }], type: 'doc' },
    coverUri: null,
    createdAt: '2026-09-20T08:00:00.000Z',
    description: text,
    favorite: false,
    id,
    latitude: 41.99,
    locationLabel: `${text} location`,
    longitude: 21.43,
    mood: 'Calm',
    plainText: text,
    reviewed: false,
    sectionId,
    title: `${text} title`,
    todoItems: [{ completed: false, dueTag: null, id: `${id}-todo`, text }],
    updatedAt: '2026-09-20T08:00:00.000Z',
  };
}

const publicEntry = entry('00000000-0000-4000-8000-000000000101', 'home', 'Public note');
const privateEntry = entry('00000000-0000-4000-8000-000000000102', 'private', secret);

beforeEach(() => db.reset());

test('the HTML export never contains Private entries or their metadata', () => {
  const html = journalExportHtml([publicEntry, privateEntry], []);
  assert.match(html, /Public note title/);
  assert.doesNotMatch(html, new RegExp(secret));
  assert.match(html, /1 entry/);
});

test('regular sync refuses to upload a Private entry and sends no Private plaintext', async () => {
  const result = await synchronizeJournal(userId, {
    entries: [privateEntry],
    expandedSectionIds: [],
    pending: [
      { baseVersion: 0, entityId: privateEntry.id, entry: privateEntry, kind: 'entry-upsert', mutationId: 'm-1' },
    ],
    syncIssues: [],
    trips: [],
    version: 1,
  });

  assert.equal(result.pending.length, 1);
  assert.equal(result.syncIssues[0].kind, 'error');
  assert.equal(db.rows('entries').length, 0);
  assert.doesNotMatch(JSON.stringify(db.requests), new RegExp(secret));
});

test('regular sync never pulls Private rows into the plaintext journal', async () => {
  await synchronizeJournal(userId, {
    entries: [],
    expandedSectionIds: [],
    pending: [],
    syncIssues: [],
    trips: [],
    version: 1,
  });
  const privateSection = db.rows('journal_sections').find((row) => row.built_in_key === 'private');
  db.rows('entries').push({
    body: { content: [], type: 'doc' },
    entry_date: '2026-09-20T08:00:00.000Z',
    favorite: false,
    id: '00000000-0000-4000-8000-000000000103',
    is_private: true,
    reviewed: false,
    section_id: privateSection.id,
    sync_version: 1,
    title: secret,
    updated_at: '2026-09-20T08:00:00.000Z',
    user_id: userId,
  });

  const result = await synchronizeJournal(userId, {
    entries: [],
    expandedSectionIds: [],
    pending: [],
    syncIssues: [],
    trips: [],
    version: 1,
  });
  assert.deepEqual(result.entries, []);
});

test('Private sync uploads only ciphertext, a nonce, and non-content metadata', async () => {
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
    id: '00000000-0000-4000-8000-000000000104',
    nonce: 'bm9uY2U=',
    syncVersion: 0,
    updatedAt: '2026-09-20T08:00:00.000Z',
    version: 1,
  };

  const result = await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: 0, kind: 'upsert', mutationId: 'm-2', record }],
    records: [record],
    syncIssues: [],
    version: 1,
  });

  assert.deepEqual(result.pending, []);
  const row = db.rows('entries')[0];
  const contentColumns = [
    'body',
    'description',
    'latitude',
    'location_label',
    'longitude',
    'mood',
    'plain_text',
    'title',
  ];
  for (const column of contentColumns) assert.equal(row[column], undefined, `${column} must not be sent`);
  assert.equal(row.is_private, true);
  assert.equal(row.private_payload_ciphertext, record.ciphertext);
});

test('a Private record still holding its bytes as an object is uploaded as base64', async () => {
  db.rows('journal_sections').push({
    built_in_key: 'private',
    collapsed: false,
    id: 'section-private',
    is_private: true,
    user_id: userId,
  });
  const bytes = [...Buffer.from('sealed bytes!!!!!')];
  const record = {
    ciphertext: Object.fromEntries(bytes.map((byte, index) => [String(index), byte])),
    createdAt: '2026-09-20T08:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000106',
    nonce: 'bm9uY2U=',
    syncVersion: 0,
    updatedAt: '2026-09-20T08:00:00.000Z',
    version: 1,
  };

  await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: 0, kind: 'upsert', mutationId: 'm-legacy', record }],
    records: [record],
    syncIssues: [],
    version: 1,
  });
  assert.equal(db.rows('entries')[0].private_payload_ciphertext, Buffer.from(bytes).toString('base64'));
});

test('a Private edit made while the previous one is syncing does not create a conflict copy', async () => {
  db.rows('journal_sections').push({
    built_in_key: 'private',
    collapsed: false,
    id: 'section-private',
    is_private: true,
    user_id: userId,
  });
  const record = (ciphertext, syncVersion) => ({
    ciphertext,
    createdAt: '2026-09-20T08:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000105',
    nonce: 'bm9uY2Vub25jZQ==',
    syncVersion,
    updatedAt: '2026-09-20T08:00:00.000Z',
    version: 1,
  });
  const created = await synchronizePrivateJournal(userId, {
    pending: [{ baseVersion: 0, kind: 'upsert', mutationId: 'p-1', record: record('Zmlyc3Q=', 0) }],
    records: [record('Zmlyc3Q=', 0)],
    syncIssues: [],
    version: 1,
  });
  const version = created.records[0].syncVersion;
  const snapshot = {
    pending: [{ baseVersion: version, kind: 'upsert', mutationId: 'p-2', record: record('c2Vjb25k', version) }],
    records: created.records,
    syncIssues: [],
    version: 1,
  };
  const result = await synchronizePrivateJournal(userId, snapshot);
  const current = {
    ...snapshot,
    pending: [
      ...snapshot.pending,
      { baseVersion: version, kind: 'upsert', mutationId: 'p-3', record: record('dGhpcmQ=', version) },
    ],
  };
  const next = await synchronizePrivateJournal(userId, reconcilePrivateSync(current, snapshot, result));

  assert.deepEqual(next.pending, []);
  assert.equal(db.rows('entries').length, 1);
  assert.equal(db.rows('entries')[0].private_payload_ciphertext, 'dGhpcmQ=');
});
