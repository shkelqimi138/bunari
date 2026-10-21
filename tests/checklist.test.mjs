import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checklistItemId,
  collectChecklist,
  setChecklistItemChecked,
  withTodosAsChecklist,
} from '../src/domain/checklist.ts';

const entryId = '00000000-0000-4000-8000-0000000000d1';
const item = (text, checked = false, nested) => ({
  attrs: { checked },
  content: [{ content: text ? [{ text, type: 'text' }] : undefined, type: 'paragraph' }, ...(nested ? [nested] : [])],
  type: 'taskItem',
});
const doc = (...items) => ({
  content: [
    { content: [{ text: 'Groceries', type: 'text' }], type: 'paragraph' },
    { content: items, type: 'taskList' },
  ],
  type: 'doc',
});

test('checklist items in a note become To-Dos, with their text kept as written', () => {
  const todoItems = collectChecklist(
    doc(item('Buy milk @today'), item('Call home', true), item('Dentist Oct 10')),
    entryId,
  );
  assert.deepEqual(
    todoItems.map(({ completed, dueTag, text }) => ({ completed, dueTag, text })),
    [
      { completed: false, dueTag: null, text: 'Buy milk @today' },
      { completed: true, dueTag: null, text: 'Call home' },
      { completed: false, dueTag: null, text: 'Dentist Oct 10' },
    ],
  );
  assert.match(
    todoItems[0].id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    'IDs are UUIDs the database accepts',
  );
});

test('a very long checklist line becomes a To-Do the database accepts (1,000 characters)', () => {
  const [todo] = collectChecklist(doc(item('a'.repeat(1500))), entryId);
  assert.equal(todo.text.length, 1000);
});

test('empty and indented items are handled, and the same item keeps its ID', () => {
  const nested = { content: [item('Sub task')], type: 'taskList' };
  const todoItems = collectChecklist(doc(item(''), item('Parent', false, nested)), entryId);
  assert.deepEqual(
    todoItems.map((todo) => todo.text),
    ['Parent', 'Sub task'],
  );
  assert.equal(todoItems[0].id, checklistItemId(entryId, 1));
});

test('ticking a To-Do in a list ticks its checklist item in the note', () => {
  const document = doc(item('Buy milk'), item('Call home'));
  const id = checklistItemId(entryId, 1);
  const ticked = setChecklistItemChecked(document, entryId, id, true);
  assert.equal(ticked.content[1].content[1].attrs.checked, true);
  assert.equal(document.content[1].content[1].attrs.checked, false, 'the original is not changed');
  assert.equal(setChecklistItemChecked(document, entryId, 'missing', true), null);
});

test('tasks saved before checklists carried To-Dos are added to the note without dates', () => {
  const body = { content: [{ type: 'paragraph' }], type: 'doc' };
  const withTasks = withTodosAsChecklist(body, [{ completed: true, dueTag: '@2026-09-27', id: 'a', text: 'Pay rent' }]);
  assert.equal(withTasks.content[1].type, 'taskList');
  assert.equal(withTasks.content[1].content[0].attrs.checked, true);
  assert.equal(withTasks.content[1].content[0].content[0].content[0].text, 'Pay rent');
  assert.equal(
    withTodosAsChecklist(withTasks, [{ completed: false, dueTag: null, id: 'b', text: 'x' }]),
    withTasks,
    'never added twice',
  );
});

test('a note with a checklist syncs its To-Dos', async () => {
  const { db } = await import('./support/fake-supabase.mjs');
  const { synchronizeJournal } = await import('../src/data/journal-sync.ts');
  db.reset();
  const noteId = '00000000-0000-4000-8000-0000000000d2';
  const body = doc(item('Buy milk'), item('Call home', true));
  const note = {
    attachments: [],
    body,
    coverUri: null,
    createdAt: '2026-09-26T08:00:00.000Z',
    description: '',
    favorite: false,
    id: noteId,
    latitude: null,
    locationLabel: null,
    longitude: null,
    mood: null,
    plainText: 'Groceries',
    reviewed: false,
    sectionId: 'todo',
    syncVersion: 0,
    title: 'Groceries',
    todoItems: collectChecklist(body, noteId),
    updatedAt: '2026-09-26T08:00:00.000Z',
  };

  const result = await synchronizeJournal('00000000-0000-4000-8000-0000000000d3', {
    entries: [note],
    expandedSectionIds: [],
    pending: [{ baseVersion: 0, entityId: noteId, entry: note, kind: 'entry-upsert', mutationId: 'm-checklist' }],
    syncIssues: [],
    trips: [],
    version: 1,
  });

  assert.deepEqual(result.pending, [], 'the To-Dos were accepted by the database');
  assert.deepEqual(
    result.entries[0].todoItems.map(({ completed, text }) => ({ completed, text })),
    [
      { completed: false, text: 'Buy milk' },
      { completed: true, text: 'Call home' },
    ],
  );
});
