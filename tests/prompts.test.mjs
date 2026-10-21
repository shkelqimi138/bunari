import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  dailyPicks,
  journalPrompts,
  promptCategories,
  promptsForCategory,
  promptsForCategoryOn,
} from '../src/domain/prompts.ts';

const day = (offset, hour = 9) => new Date(2026, 9, 2 + offset, hour);

test('every category has 10 prompts and every prompt id is unique', () => {
  for (const category of promptCategories) assert.equal(promptsForCategory(category.id).length, 10, category.id);
  assert.equal(new Set(journalPrompts.map((prompt) => prompt.id)).size, journalPrompts.length);
});

test('the database migration holds every prompt, so each one can be saved', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261002183818_prompt_library_v2.sql', import.meta.url),
    'utf8',
  );
  for (const prompt of journalPrompts) {
    assert.ok(
      sql.includes(
        `('${prompt.id}', '${prompt.categoryId}', '${prompt.text.replaceAll("'", "''")}', ${prompt.minutes},`,
      ),
      prompt.id,
    );
  }
});

test("today's picks are three prompts from different categories, the same all day", () => {
  const morning = dailyPicks(day(0, 7));
  assert.equal(morning.length, 3);
  assert.equal(new Set(morning.map((prompt) => prompt.categoryId)).size, 3);
  assert.deepEqual(dailyPicks(day(0, 23)), morning);
});

test("today's picks change from day to day", () => {
  const weeks = Array.from({ length: 14 }, (_, offset) =>
    dailyPicks(day(offset))
      .map((prompt) => prompt.id)
      .join('|'),
  );
  assert.ok(new Set(weeks).size >= 12, `only ${new Set(weeks).size} different sets in 14 days`);
  for (let offset = 1; offset < 14; offset += 1) assert.notEqual(weeks[offset], weeks[offset - 1]);
});

test('a category keeps all its prompts but starts with different ones on different days', () => {
  const today = promptsForCategoryOn('gratitude', day(0));
  assert.deepEqual(
    [...today].map((prompt) => prompt.id).sort(),
    promptsForCategory('gratitude')
      .map((prompt) => prompt.id)
      .sort(),
  );
  assert.deepEqual(promptsForCategoryOn('gratitude', day(0, 22)), today);
  const firsts = new Set(
    Array.from({ length: 10 }, (_, offset) => promptsForCategoryOn('gratitude', day(offset))[0].id),
  );
  assert.ok(firsts.size >= 5, `only ${firsts.size} different first prompts in 10 days`);
});
