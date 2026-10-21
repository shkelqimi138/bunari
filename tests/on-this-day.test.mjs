import assert from 'node:assert/strict';
import { test } from 'node:test';

import { onThisDayYear } from '../src/domain/journal.ts';

test('On This Day keeps the year the user picked while it is still in the list', () => {
  assert.equal(onThisDayYear([2025, 2023], 2023), 2023);
});

test('On This Day falls back to the first year when the picked year is gone, e.g. after midnight', () => {
  assert.equal(onThisDayYear([2023], 2025), 2023);
  assert.equal(onThisDayYear([2024, 2022], undefined), 2024);
});

test('On This Day has no year when there are no earlier entries for the day', () => {
  assert.equal(onThisDayYear([], 2025), undefined);
});
