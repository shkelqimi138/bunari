import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createApp } from '../app.mjs';

let baseUrl;
let server;
const generated = {
  dailyPrompt: async () => ({ minutes: 6, prompt: 'What deserves your full attention today?' }),
  model: 'gpt-5.4-mini',
  moodSuggestion: async () => ({ mood: 'Focused', reason: 'The entry centers on deliberate priorities.' }),
  provider: 'openai',
  weeklySummary: async () => ({
    encouragement: 'Keep making room for deliberate pauses.',
    headline: 'A week of clearer priorities',
    overview: 'Your writing returned to focus and rest.',
    patterns: ['You protected time for focused work.'],
  }),
};
const stored = {
  getDailyPrompt: async () => null,
  getEntry: async ({ entryId }) =>
    entryId === '11111111-1111-4111-8111-111111111111'
      ? { description: '', plain_text: 'Three deliberate priorities.', title: 'Today' }
      : null,
  getWeeklySummary: async () => null,
  listWeeklyEntries: async () => [
    { entry_date: '2026-09-01T10:00:00Z', mood: 'Focused', plain_text: 'Deep work.', title: 'Tuesday' },
  ],
  saveDailyPrompt: async () => {},
  saveWeeklySummary: async () => {},
};
const deletedUserIds = [];
const nowMs = Date.parse('2026-09-05T12:00:00Z');
// Unsigned test tokens: the app reads only `iat` and the `amr` sign-in records; signatures are checked by Supabase.
const token = ({ issued, signedIn }) =>
  `header.${Buffer.from(
    JSON.stringify({
      amr: [{ method: 'password', timestamp: nowMs / 1000 - signedIn }],
      iat: nowMs / 1000 - issued,
    }),
  ).toString('base64url')}.signature`;
const freshToken = token({ issued: 60, signedIn: 60 });
const staleToken = token({ issued: 3600, signedIn: 3600 });
// A session refreshed a minute ago whose last real sign-in was a day ago.
const refreshedToken = token({ issued: 60, signedIn: 86_400 });

before(async () => {
  server = createApp({
    accountAdmin: {
      deleteAccount: async (userId) => {
        deletedUserIds.push(userId);
      },
    },
    ai: generated,
    aiStore: stored,
    allowedOrigins: new Set(['https://journal.example']),
    authenticate: async (authorization) => {
      if (
        ['Bearer valid', `Bearer ${freshToken}`, `Bearer ${staleToken}`, `Bearer ${refreshedToken}`].includes(
          authorization,
        )
      ) {
        return { email: 'journal@example.com', id: 'user-1' };
      }
      if (authorization === 'Bearer quota-user') return { email: null, id: 'user-2' };
      return null;
    },
    now: () => nowMs,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

test('health endpoint is public', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'bunari-api', status: 'ok' });
  assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
});

test('session endpoint rejects missing credentials', async () => {
  const response = await fetch(`${baseUrl}/v1/session`);
  assert.equal(response.status, 401);
});

test('session endpoint returns the authenticated user', async () => {
  const response = await fetch(`${baseUrl}/v1/session`, { headers: { authorization: 'Bearer valid' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { email: 'journal@example.com', id: 'user-1' } });
});

test('account deletion requires authentication and deletes only the authenticated user', async () => {
  const unauthorized = await fetch(`${baseUrl}/v1/account`, { method: 'DELETE' });
  assert.equal(unauthorized.status, 401);

  const stale = await fetch(`${baseUrl}/v1/account`, {
    headers: { authorization: `Bearer ${staleToken}` },
    method: 'DELETE',
  });
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).error.code, 'reauthentication_required');
  assert.deepEqual(deletedUserIds, [], 'an hour-old session cannot delete the profile');

  const refreshed = await fetch(`${baseUrl}/v1/account`, {
    headers: { authorization: `Bearer ${refreshedToken}` },
    method: 'DELETE',
  });
  assert.equal(refreshed.status, 401);
  assert.equal((await refreshed.json()).error.code, 'reauthentication_required');
  assert.deepEqual(deletedUserIds, [], 'refreshing a session is not signing in again');

  const response = await fetch(`${baseUrl}/v1/account`, {
    headers: { authorization: `Bearer ${freshToken}` },
    method: 'DELETE',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(deletedUserIds, ['user-1']);
});

test('unknown routes return a structured error', async () => {
  const response = await fetch(`${baseUrl}/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'not_found');
});

test('CORS only reflects configured origins', async () => {
  const allowed = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://journal.example' } });
  const denied = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://other.example' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://journal.example');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('daily prompt endpoint generates an authenticated prompt', async () => {
  const response = await fetch(`${baseUrl}/v1/ai/daily-prompt?date=2026-09-04&timezone=Europe%2FBerlin`, {
    headers: { authorization: 'Bearer valid' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.prompt, 'What deserves your full attention today?');
  assert.equal(body.minutes, 6);
});

test('mood endpoint accepts only a synced non-Private entry', async () => {
  const found = await fetch(`${baseUrl}/v1/ai/mood-suggestion`, {
    body: JSON.stringify({ entryId: '11111111-1111-4111-8111-111111111111' }),
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    method: 'POST',
  });
  const missing = await fetch(`${baseUrl}/v1/ai/mood-suggestion`, {
    body: JSON.stringify({ entryId: '22222222-2222-4222-8222-222222222222' }),
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(found.status, 200);
  assert.equal((await found.json()).mood, 'Focused');
  assert.equal(missing.status, 404);
});

test('weekly summary uses only entries supplied by the non-Private store query', async () => {
  const response = await fetch(`${baseUrl}/v1/ai/weekly-summary?start=2026-08-31&end=2026-09-06`, {
    headers: { authorization: 'Bearer valid' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).summary.patterns.length, 1);
});

test('AI endpoints reject unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/v1/ai/daily-prompt?date=2026-09-04&timezone=Europe%2FBerlin`);
  assert.equal(response.status, 401);
});

test('daily prompts are limited to dates around today and weekly summaries to recent weeks', async () => {
  const headers = { authorization: 'Bearer valid' };
  const farDate = await fetch(`${baseUrl}/v1/ai/daily-prompt?date=2020-01-01&timezone=Europe%2FBerlin`, { headers });
  assert.equal(farDate.status, 400);
  const tomorrow = await fetch(`${baseUrl}/v1/ai/daily-prompt?date=2026-09-06&timezone=Pacific%2FAuckland`, {
    headers,
  });
  assert.equal(tomorrow.status, 200);
  const oldWeek = await fetch(`${baseUrl}/v1/ai/weekly-summary?start=2025-08-31&end=2025-09-06`, { headers });
  assert.equal(oldWeek.status, 400);
  const futureWeek = await fetch(`${baseUrl}/v1/ai/weekly-summary?start=2026-09-10&end=2026-09-16`, { headers });
  assert.equal(futureWeek.status, 400);
});

test('each account has a daily limit on new AI results', async () => {
  const request = () =>
    fetch(`${baseUrl}/v1/ai/mood-suggestion`, {
      body: JSON.stringify({ entryId: '11111111-1111-4111-8111-111111111111' }),
      headers: { authorization: 'Bearer quota-user', 'content-type': 'application/json' },
      method: 'POST',
    });
  for (let index = 0; index < 30; index += 1) assert.equal((await request()).status, 200);
  const limited = await request();
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'ai_limit_reached');
  const otherUser = await fetch(`${baseUrl}/v1/ai/daily-prompt?date=2026-09-05&timezone=Europe%2FBerlin`, {
    headers: { authorization: 'Bearer valid' },
  });
  assert.equal(otherUser.status, 200, 'the limit is per account');
});
