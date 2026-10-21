import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { synchronizeJournal } from '../src/data/journal-sync.ts';
import { moodContentKey, moodSuggestionState } from '../src/domain/mood.ts';
import { db } from './support/fake-supabase.mjs';

const userId = '00000000-0000-4000-8000-0000000000ee';

function entry(overrides = {}) {
  return {
    attachments: [],
    body: { content: [], type: 'doc' },
    coverUri: null,
    createdAt: '2026-10-02T08:00:00.000Z',
    description: '',
    favorite: false,
    id: '00000000-0000-4000-8000-000000000e01',
    latitude: null,
    locationLabel: null,
    longitude: null,
    mood: null,
    plainText: 'Too many things at once today.',
    reviewed: false,
    sectionId: 'home',
    syncVersion: 0,
    title: 'Busy day',
    todoItems: [],
    updatedAt: '2026-10-02T08:00:00.000Z',
    ...overrides,
  };
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

test('a saved suggestion stays fresh until the title, description or text changes', () => {
  const value = entry();
  const suggested = {
    ...value,
    moodSuggestion: { contentKey: moodContentKey(value), mood: 'Restless', reason: 'A lot is happening at once.' },
  };

  assert.equal(moodSuggestionState(value), 'none');
  assert.equal(moodSuggestionState(suggested), 'fresh');
  // Applying the mood, favoriting or moving the entry does not change what the AI read.
  assert.equal(moodSuggestionState({ ...suggested, favorite: true, mood: 'Restless' }), 'fresh');
  assert.equal(moodSuggestionState({ ...suggested, plainText: `${value.plainText} Then it got calmer.` }), 'stale');
  assert.equal(moodSuggestionState({ ...suggested, title: 'Busy morning' }), 'stale');
  assert.equal(moodSuggestionState({ ...suggested, description: 'Work' }), 'stale');
});

test('surrounding spaces do not count as a change, but a different word does', () => {
  assert.equal(moodContentKey(entry({ plainText: '  Too many things at once today. ' })), moodContentKey(entry()));
  assert.notEqual(moodContentKey(entry({ plainText: 'Too many things at once tonight.' })), moodContentKey(entry()));
});

test('the suggestion syncs with the entry and a lost reply is still recognized', async () => {
  const value = entry();
  const synced = (
    await syncOnce(
      [value],
      [{ baseVersion: 0, entityId: value.id, entry: value, kind: 'entry-upsert', mutationId: 'm-1' }],
    )
  ).entries[0];
  const suggestion = { contentKey: moodContentKey(value), mood: 'Restless', reason: 'A lot is happening at once.' };
  const withSuggestion = { ...synced, moodSuggestion: suggestion };

  const result = await syncOnce(
    [withSuggestion],
    [
      {
        baseVersion: synced.syncVersion,
        entityId: value.id,
        entry: withSuggestion,
        kind: 'entry-upsert',
        mutationId: 'm-2',
      },
    ],
  );
  assert.deepEqual(db.rows('entries')[0].mood_suggestion, suggestion);
  assert.deepEqual(result.entries[0].moodSuggestion, suggestion);

  // The device never heard back: the row already holds this suggestion, so no conflict copy.
  const retry = await syncOnce(
    [withSuggestion],
    [
      {
        baseVersion: synced.syncVersion,
        entityId: value.id,
        entry: withSuggestion,
        kind: 'entry-upsert',
        mutationId: 'm-3',
      },
    ],
  );
  assert.equal(db.rows('entries').length, 1);
  assert.equal(retry.syncIssues.length, 0);
});
