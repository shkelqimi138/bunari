import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentStreak, wroteOn } from '../src/domain/streak.ts';

// Local times, like the app: the streak follows the phone's own days.
const at = (day, hour = 9) => new Date(2026, 9, day, hour);

test('the streak counts the days in a row up to today', () => {
  assert.equal(currentStreak([at(1), at(2)], at(2, 18)), 2);
  // Two entries on one day count once.
  assert.equal(currentStreak([at(1), at(2, 8), at(2, 20)], at(2, 21)), 2);
});

test('before the first entry of the day the streak still counts up to yesterday', () => {
  const monToThu = [new Date(2026, 8, 28, 9), new Date(2026, 8, 29, 9), new Date(2026, 8, 30, 9), at(1, 18)];
  assert.equal(currentStreak(monToThu, at(2, 7)), 4);
  assert.equal(wroteOn(monToThu, at(2, 7)), false);
});

test('a missed day ends the streak', () => {
  assert.equal(currentStreak([new Date(2026, 8, 29, 9), new Date(2026, 8, 30, 9)], at(2, 10)), 0);
  assert.equal(currentStreak([], at(2, 10)), 0);
});

test('writing today adds today to the streak', () => {
  const dates = [new Date(2026, 8, 30, 9), at(1, 9), at(2, 7)];
  assert.equal(currentStreak(dates, at(2, 23)), 3);
  assert.equal(wroteOn(dates, at(2, 23)), true);
});
