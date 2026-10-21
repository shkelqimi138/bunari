import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeReminderTime,
  reminderAction,
  reminderTimeAsDate,
  reminderTimeFromDate,
} from '../src/domain/reminder.ts';

test('the phone schedules the reminder only when it is on and notifications are allowed', () => {
  assert.equal(reminderAction(true, 'granted'), 'schedule');
  // Never asked: explain first, ask only from a tap.
  assert.equal(reminderAction(true, 'undetermined'), 'ask');
  // Declined on this phone: only this phone goes without; the account keeps its setting.
  assert.equal(reminderAction(true, 'denied'), 'blocked');
  for (const permission of ['granted', 'undetermined', 'denied'])
    assert.equal(reminderAction(false, permission), 'cancel');
});

test('any valid time is kept, and anything else falls back to 20:00', () => {
  assert.equal(normalizeReminderTime('07:05'), '07:05');
  assert.equal(normalizeReminderTime('7:05'), '07:05');
  assert.equal(normalizeReminderTime('21:30:00'), '21:30');
  assert.equal(normalizeReminderTime('24:00'), '20:00');
  assert.equal(normalizeReminderTime('12:60'), '20:00');
  assert.equal(normalizeReminderTime(null), '20:00');
  assert.equal(normalizeReminderTime('soon'), '20:00');
});

test('the picker shows the saved time and saves the picked one', () => {
  const shown = reminderTimeAsDate('06:45', new Date(2026, 9, 2, 15, 12));
  assert.equal(shown.getHours(), 6);
  assert.equal(shown.getMinutes(), 45);
  assert.equal(reminderTimeFromDate(shown), '06:45');
  assert.equal(reminderTimeFromDate(new Date(2026, 9, 2, 23, 5)), '23:05');
});
