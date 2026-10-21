import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dateRangeProblem,
  editTypedDate,
  formatTypedDate,
  storedDateToTyped,
  typedDateToStored,
} from '../src/domain/typed-date.ts';
import { journalExportHtml } from '../src/lib/export/export-data.ts';

test('typed digits get their dots by themselves, one digit at a time', () => {
  const steps = ['0', '05', '05.1', '05.10', '05.10.2', '05.10.20', '05.10.202', '05.10.2026'];
  let typed = '';
  for (const [index, digit] of [...'05102026'].entries()) {
    typed = formatTypedDate(typed + digit);
    assert.equal(typed, steps[index]);
  }
  // Deleting the last character never leaves a dangling dot.
  assert.equal(formatTypedDate('05.10.'), '05.10');
  assert.equal(formatTypedDate('05.'), '05');
});

test('only digits count, and at most eight of them', () => {
  assert.equal(formatTypedDate('05-10-2026'), '05.10.2026');
  assert.equal(formatTypedDate('05 10 2026'), '05.10.2026');
  assert.equal(formatTypedDate('05..10.2026'), '05.10.2026');
  assert.equal(formatTypedDate('051020261'), '05.10.2026');
  assert.equal(formatTypedDate('abc'), '');
  assert.equal(formatTypedDate(''), '');
});

// The keyboard's text after an edit: `previous` with `inserted` put at the cursor (or over the selection).
function type(previous, start, inserted, end = start) {
  return editTypedDate(previous, { end, start }, previous.slice(0, start) + inserted + previous.slice(end));
}
function backspace(previous, caret) {
  return editTypedDate(previous, { end: caret, start: caret }, previous.slice(0, caret - 1) + previous.slice(caret));
}

test('typing from empty fills day, month and year, and deleting at the end goes back', () => {
  let field = { caret: 0, text: '' };
  for (const digit of '24052026') field = type(field.text, field.caret, digit);
  assert.deepEqual(field, { caret: 10, text: '24.05.2026' });
  assert.deepEqual(type('24', 2, '0'), { caret: 4, text: '24.0' });
  assert.deepEqual(backspace('24.05.2026', 10), { caret: 9, text: '24.05.202' });
  assert.deepEqual(backspace('24.0', 4), { caret: 2, text: '24' });
  assert.deepEqual(backspace('2', 1), { caret: 0, text: '' });
});

test('deleting in the middle empties that place only; the year never moves into the month', () => {
  // The user's case: deleting the 5 of 24.05.2026.
  assert.deepEqual(backspace('24.05.2026', 5), { caret: 4, text: '24.0.2026' });
  assert.deepEqual(type('24.0.2026', 4, '6'), { caret: 5, text: '24.06.2026' });
  // Deleting the whole month (selected) leaves its place empty.
  assert.deepEqual(type('24.05.2026', 3, '', 5), { caret: 3, text: '24..2026' });
  assert.deepEqual(type('24..2026', 3, '1'), { caret: 4, text: '24.1.2026' });
  assert.deepEqual(type('24.1.2026', 4, '2'), { caret: 5, text: '24.12.2026' });
  // Deleting a digit of the day.
  assert.deepEqual(backspace('24.05.2026', 2), { caret: 1, text: '2.05.2026' });
});

test('a day above 31 or a month above 12 cannot be typed', () => {
  assert.deepEqual(type('24.1.2026', 4, '5'), { caret: 4, text: '24.1.2026' });
  assert.deepEqual(type('24.0.2026', 4, '0'), { caret: 4, text: '24.0.2026' });
  assert.deepEqual(type('3', 1, '5'), { caret: 1, text: '3' });
  assert.deepEqual(type('0', 1, '0'), { caret: 1, text: '0' });
  // A full part does not take more digits in its middle.
  assert.deepEqual(type('24.05.202', 4, '1'), { caret: 4, text: '24.05.202' });
});

test('a day of 4–9 or a month of 2–9 becomes 04–09 by itself', () => {
  assert.deepEqual(type('', 0, '5'), { caret: 2, text: '05' });
  assert.deepEqual(type('24', 2, '5'), { caret: 5, text: '24.05' });
  assert.deepEqual(type('24..2026', 3, '7'), { caret: 5, text: '24.07.2026' });
  assert.deepEqual(type('', 0, '3'), { caret: 1, text: '3' });
  assert.deepEqual(type('24', 2, '1'), { caret: 4, text: '24.1' });
});

test('backspace just after a dot deletes the digit before it', () => {
  assert.deepEqual(backspace('24.05.2026', 3), { caret: 1, text: '2.05.2026' });
  assert.deepEqual(backspace('24.05.2026', 6), { caret: 4, text: '24.0.2026' });
  // With nothing before the dot, the cursor just moves in front of it.
  assert.deepEqual(backspace('24..2026', 4), { caret: 3, text: '24..2026' });
});

test('replacing everything, pasting, and an unknown cursor', () => {
  assert.deepEqual(type('06.10.2026', 0, '1', 10), { caret: 1, text: '1' });
  assert.deepEqual(type('', 0, '05/10/2026'), { caret: 10, text: '05.10.2026' });
  // A cursor that does not match the edit (e.g. not reported yet) reshapes the text from its digits.
  assert.deepEqual(editTypedDate('05.10', { end: 0, start: 0 }, '05.107'), { caret: 7, text: '05.10.7' });
});

test('a cursor reported after the edit, not before it, never loses a typed digit', () => {
  // If the field reported where the cursor ended up before reporting the new text, the edit would look
  // like nothing was typed; the date is then rebuilt from all its digits instead.
  assert.deepEqual(editTypedDate('2', { end: 2, start: 2 }, '24'), { caret: 2, text: '24' });
  assert.deepEqual(editTypedDate('24.05.202', { end: 10, start: 10 }, '24.05.2026'), { caret: 10, text: '24.05.2026' });
});

test('a date with an empty or one-digit part is not saved', () => {
  assert.equal(typedDateToStored('24..2026'), null);
  assert.equal(typedDateToStored('24.0.2026'), null);
  assert.equal(typedDateToStored('24.1.2026'), null);
});

test('the form says "Invalid … date" as soon as a date stops being valid', () => {
  const hint = 'Use day, month and year, for example 05.10.2026.';
  assert.equal(dateRangeProblem('24.05.2026', '28.05.2026'), null);
  // The user's case: deleting the 6 of the year.
  assert.equal(dateRangeProblem(backspace('24.05.2026', 10).text, '28.05.2026'), `Invalid start date. ${hint}`);
  assert.equal(dateRangeProblem('24.05.2026', '28.0.2026'), `Invalid end date. ${hint}`);
  assert.equal(dateRangeProblem('31.02.2026', ''), `Invalid dates. ${hint}`);
  assert.equal(dateRangeProblem('28.05.2026', '24.05.2026'), 'The end date is before the start date.');
  assert.equal(dateRangeProblem('24.05.2026', '24.05.2026'), null);
});

test('a complete, real date becomes the stored YYYY-MM-DD', () => {
  assert.equal(typedDateToStored('05.10.2026'), '2026-10-05');
  assert.equal(typedDateToStored('31.12.2026'), '2026-12-31');
  assert.equal(typedDateToStored('29.02.2028'), '2028-02-29');
  assert.equal(typedDateToStored(' 01.01.1900 '), '1900-01-01');
});

test('impossible or unfinished dates are refused', () => {
  for (const typed of [
    '31.02.2026',
    '29.02.2026',
    '31.04.2026',
    '00.10.2026',
    '05.00.2026',
    '05.13.2026',
    '05.10.202',
    '05.10',
    '',
    '2026-10-05',
    '5.10.2026',
    '05.10.1899',
    '05.10.2101',
    '05.10.0202',
  ]) {
    assert.equal(typedDateToStored(typed), null, typed);
  }
});

test('stored dates show as DD.MM.YYYY and back', () => {
  assert.equal(storedDateToTyped('2026-10-05'), '05.10.2026');
  assert.equal(typedDateToStored(storedDateToTyped('2026-02-28')), '2026-02-28');
  assert.equal(storedDateToTyped('not a date'), 'not a date');
});

test('the readable export lists trip dates as DD.MM.YYYY', () => {
  const trip = { destination: 'Rome', emoji: '🇮🇹', endDate: '2026-09-22', id: 't1', startDate: '2026-09-18' };
  const html = journalExportHtml([], [trip]);
  assert.match(html, /18\.09\.2026 – 22\.09\.2026/);
  assert.doesNotMatch(html, /2026-09-18/);
});
