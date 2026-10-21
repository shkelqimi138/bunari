import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { websiteLinks } from '../src/config/website.ts';
import {
  aiFeaturesAllowed,
  aiPermissionQuestion,
  aiPermissionSummary,
  weeklyInsightDisclosure,
} from '../src/domain/ai-permission.ts';

const site = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');

function popup(id) {
  const start = site.indexOf(`<section class="modal" id="${id}"`);
  assert.ok(start >= 0, `${id} popup`);
  return site.slice(start, site.indexOf('\n</section>', start));
}

test('AI features that send entries are off until allowed on this device', () => {
  assert.equal(aiFeaturesAllowed(undefined, 'user-a', 'user-a'), false);
  assert.equal(aiFeaturesAllowed(false, 'user-a', 'user-a'), false);
  assert.equal(aiFeaturesAllowed(true, 'user-a', 'user-a'), true);
});

test("one account's permission never counts for another account on the same iPhone (code review, 2026-10-07)", () => {
  // Account B has just signed in; account A's settings (with AI allowed) are still in memory.
  assert.equal(aiFeaturesAllowed(true, 'user-a', 'user-b'), false);
  // Nothing loaded yet, or nobody signed in.
  assert.equal(aiFeaturesAllowed(true, null, 'user-b'), false);
  assert.equal(aiFeaturesAllowed(true, 'user-a', null), false);
  assert.equal(aiFeaturesAllowed(true, 'user-a', undefined), false);
});

test('every AI notice names OpenAI, the 30 days, and that Private entries are never sent', () => {
  for (const text of [aiPermissionQuestion.message, weeklyInsightDisclosure, aiPermissionSummary]) {
    assert.match(text, /OpenAI/);
    assert.match(text, /30 days/);
    assert.match(text, /Private entries are never sent/);
  }
  assert.match(aiPermissionQuestion.message, /turn this off in Account/);
});

test('the privacy policy says the same about the AI features', () => {
  const privacy = popup('privacy');
  assert.match(privacy, /<h2>AI features<\/h2>/);
  assert.match(privacy, /written by OpenAI/);
  assert.match(privacy, /up to 30 days/);
  assert.match(privacy, /We ask your permission before the first mood suggestion or Weekly Insight/);
  // What the server sends for Weekly Insight (server/app.mjs weeklySummaryInput): date, title, mood and text.
  assert.match(privacy, /Weekly Insight sends the date, title, mood and text of your regular entries/);
  assert.match(privacy, /The daily prompt sends only today's date/);
});

test('no address or phone is published, and the name is only in the small print (user, 2026-10-07)', () => {
  assert.ok(!site.includes('id="imprint"'), 'no legal notice');
  assert.equal(websiteLinks.imprint, undefined);
  for (const detail of ['[street and number]', '[postcode and city]', '[phone number]'])
    assert.ok(!site.includes(detail), detail);
  const name = 'Shkelqim Surkishi';
  for (const head of site.match(/<header class="modal-head">[\s\S]*?<\/header>/g) ?? []) {
    assert.ok(!head.includes(name), 'no name at the top of a popup');
  }
  const names = site.split(name).length - 1;
  const inSmallPrint = (site.match(/<section class="fine">[\s\S]*?<\/section>/g) ?? []).join('').split(name).length - 1;
  assert.equal(names, 2, 'the privacy policy and the terms');
  assert.equal(inSmallPrint, names, 'every mention of the name is in a small-print section');
  assert.ok(!site.includes('class="placeholder"'), 'no placeholders left');
});
