import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSupabaseAiStore } from '../ai-store.mjs';
import { createApp } from '../app.mjs';

const ai = {
  dailyPrompt: async () => ({ minutes: 6, prompt: 'What deserves your full attention today?' }),
  model: 'gpt-5.4-mini',
  moodSuggestion: async () => ({ mood: 'Focused', reason: 'The entry centers on deliberate priorities.' }),
  provider: 'openai',
};
const entryId = '11111111-1111-4111-8111-111111111111';
const nowMs = Date.parse('2026-09-05T12:00:00Z');

async function withApp(options, run) {
  let clock = nowMs;
  const server = createApp({
    ai,
    aiStore: {
      getEntry: async () => ({ description: '', plain_text: 'Deep work.', title: 'Today' }),
      ...options.aiStore,
    },
    authenticate: async (authorization) => (authorization === 'Bearer valid' ? { email: null, id: 'user-1' } : null),
    now: () => clock,
    ...options.app,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, (milliseconds) => {
      clock += milliseconds;
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const mood = (baseUrl) =>
  fetch(`${baseUrl}/v1/ai/mood-suggestion`, {
    body: JSON.stringify({ entryId }),
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    method: 'POST',
  });

test('each address is limited per minute, with or without a valid token', async () => {
  await withApp({ app: { requestsPerMinute: 3 } }, async (baseUrl, advance) => {
    const session = (headers = {}) =>
      fetch(`${baseUrl}/v1/session`, { headers: { authorization: 'Bearer wrong', ...headers } });
    for (let index = 0; index < 3; index += 1) assert.equal((await session()).status, 401);
    const limited = await session();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await limited.json()).error.code, 'rate_limited');
    // X-Forwarded-For is written by the caller and never identifies them (2026-10-08).
    assert.equal(
      (await session({ 'x-forwarded-for': '203.0.113.9' })).status,
      429,
      'a made-up X-Forwarded-For does not bypass the limit',
    );
    assert.equal(
      (await session({ 'x-forwarded-for': '127.0.0.1, 198.51.100.7' })).status,
      429,
      'nor does any value in it',
    );
    // Railway's edge puts the caller's address in X-Real-IP; another address has its own limit.
    assert.equal((await session({ 'x-real-ip': '198.51.100.7' })).status, 401, 'another address has its own limit');
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200, 'health checks are never limited');
    advance(60_000);
    assert.equal((await session()).status, 401, 'the limit resets after a minute');
  });
});

test('the rate limit counts a bounded number of addresses per minute, so memory cannot grow without limit (2026-10-08)', async () => {
  await withApp({ app: { rateLimitAddresses: 2, requestsPerMinute: 1 } }, async (baseUrl, advance) => {
    const from = (address) =>
      fetch(`${baseUrl}/v1/session`, { headers: { authorization: 'Bearer wrong', 'x-real-ip': address } });
    assert.equal((await from('198.51.100.1')).status, 401);
    assert.equal((await from('198.51.100.1')).status, 429, 'a counted address is limited');
    assert.equal((await from('198.51.100.2')).status, 401);
    // The table is full: a third address passes uncounted for the rest of the minute.
    assert.equal((await from('198.51.100.3')).status, 401);
    assert.equal((await from('198.51.100.3')).status, 401, 'an address beyond the cap is not counted');
    assert.equal((await from('198.51.100.1')).status, 429, 'addresses already counted stay limited');
    advance(60_000);
    assert.equal((await from('198.51.100.3')).status, 401);
    assert.equal((await from('198.51.100.3')).status, 429, 'after the minute it is counted like any other');
  });
});

test('the daily AI limit is taken from the database when available', async () => {
  const calls = [];
  const aiStore = {
    takeAiQuota: async (request) => {
      calls.push(request);
      return calls.length <= 2;
    },
  };
  await withApp({ aiStore }, async (baseUrl) => {
    assert.equal((await mood(baseUrl)).status, 200);
    assert.equal((await mood(baseUrl)).status, 200);
    const limited = await mood(baseUrl);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'ai_limit_reached');
    assert.deepEqual(calls[0], { authorization: 'Bearer valid', limit: 30 });
  });
});

test('the in-memory AI limit is used when the database count is unavailable', async () => {
  for (const takeAiQuota of [
    async () => null,
    async () => {
      throw new Error('Supabase unavailable');
    },
  ]) {
    await withApp({ aiStore: { takeAiQuota }, app: { aiDailyLimit: 2 } }, async (baseUrl) => {
      assert.equal((await mood(baseUrl)).status, 200);
      assert.equal((await mood(baseUrl)).status, 200);
      assert.equal((await mood(baseUrl)).status, 429);
    });
  }
});

test('the database AI count calls take_ai_quota as the user and tolerates a missing migration', async () => {
  const responses = [
    new Response('true', { headers: { 'content-type': 'application/json' }, status: 200 }),
    new Response('false', { headers: { 'content-type': 'application/json' }, status: 200 }),
    new Response('{"code":"PGRST202"}', { headers: { 'content-type': 'application/json' }, status: 404 }),
  ];
  let captured;
  const store = createSupabaseAiStore({
    fetchImpl: async (url, init) => {
      captured = { init, url };
      return responses.shift();
    },
    supabasePublishableKey: 'publishable',
    supabaseUrl: 'https://project.supabase.co',
  });
  assert.equal(await store.takeAiQuota({ authorization: 'Bearer user-token', limit: 30 }), true);
  assert.equal(captured.url, 'https://project.supabase.co/rest/v1/rpc/take_ai_quota');
  assert.equal(captured.init.headers.authorization, 'Bearer user-token');
  assert.deepEqual(JSON.parse(captured.init.body), { daily_limit: 30 });
  assert.equal(await store.takeAiQuota({ authorization: 'Bearer user-token', limit: 30 }), false);
  assert.equal(await store.takeAiQuota({ authorization: 'Bearer user-token', limit: 30 }), null);
});

test('the weekly summary sends at most 2,000 characters per entry and 40,000 in total', async () => {
  let sent;
  const huge = (index) => ({
    entry_date: `2026-09-0${1 + (index % 4)}T10:00:00Z`,
    mood: 'Calm',
    plain_text: 'x'.repeat(50_000),
    title: `Day ${index}`,
  });
  const options = {
    aiStore: {
      getWeeklySummary: async () => null,
      listWeeklyEntries: async () => Array.from({ length: 60 }, (_, index) => huge(index)),
      saveWeeklySummary: async () => {},
    },
    app: {
      ai: {
        ...ai,
        weeklySummary: async ({ entries }) => {
          sent = entries;
          return {
            encouragement: 'Keep going.',
            headline: 'A steady week',
            overview: 'You wrote often.',
            patterns: ['Daily notes.'],
          };
        },
      },
    },
  };
  await withApp(options, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ai/weekly-summary?start=2026-08-29&end=2026-09-04`, {
      headers: { authorization: 'Bearer valid' },
    });
    assert.equal(response.status, 200);
  });
  assert.ok(sent.length > 0 && sent.length < 60);
  assert.ok(sent.every((entry) => entry.plain_text.length === 2000));
  const total = sent.reduce((sum, entry) => sum + entry.title.length + entry.plain_text.length, 0);
  assert.ok(total <= 40_000, `sent ${total} characters`);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['entry_date', 'mood', 'plain_text', 'title']);
});

test('a saved daily prompt that was cut off is made again, and a complete one is reused', async () => {
  const saved = [];
  let generatedCount = 0;
  const cutPrompt = 'Describe what happened and why you think it affected you. Then reflect: what does this';
  const options = (cachedPrompt) => ({
    aiStore: {
      getDailyPrompt: async () => ({
        estimated_minutes: 10,
        model: 'gpt-5.4-mini',
        prompt_text: cachedPrompt,
        provider: 'openai',
      }),
      saveDailyPrompt: async (row) => {
        saved.push(row);
      },
    },
    app: {
      ai: {
        ...ai,
        dailyPrompt: async () => {
          generatedCount += 1;
          return { minutes: 6, prompt: 'What small moment changed your mood this week?' };
        },
      },
    },
  });
  const url = (baseUrl) => `${baseUrl}/v1/ai/daily-prompt?date=2026-09-05&timezone=Europe%2FBelgrade`;
  await withApp(options(cutPrompt), async (baseUrl) => {
    const body = await (await fetch(url(baseUrl), { headers: { authorization: 'Bearer valid' } })).json();
    assert.equal(body.cached, false);
    assert.equal(body.prompt, 'What small moment changed your mood this week?');
  });
  assert.equal(generatedCount, 1);
  assert.equal(saved[0].prompt, 'What small moment changed your mood this week?', 'the cut prompt is replaced');

  await withApp(options('What deserves your full attention today?'), async (baseUrl) => {
    const body = await (await fetch(url(baseUrl), { headers: { authorization: 'Bearer valid' } })).json();
    assert.equal(body.cached, true);
    assert.equal(body.prompt, 'What deserves your full attention today?');
  });
  assert.equal(generatedCount, 1, 'a complete saved prompt costs no new AI call');
});

test('a saved weekly summary that was cut off is made again', async () => {
  let generatedCount = 0;
  const complete = {
    encouragement: 'Keep going.',
    headline: 'A steady week',
    overview: 'You wrote often.',
    patterns: ['Daily notes.'],
  };
  const options = {
    aiStore: {
      getWeeklySummary: async () => ({
        model: 'gpt-5.4-mini',
        provider: 'openai',
        summary: { ...complete, overview: 'You wrote about work, rest, and the conversation that chang' },
      }),
      listWeeklyEntries: async () => [
        { entry_date: '2026-09-01T10:00:00Z', mood: 'Calm', plain_text: 'A walk.', title: 'Tuesday' },
      ],
      saveWeeklySummary: async () => {},
    },
    app: {
      ai: {
        ...ai,
        weeklySummary: async () => {
          generatedCount += 1;
          return complete;
        },
      },
    },
  };
  await withApp(options, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ai/weekly-summary?start=2026-08-29&end=2026-09-04`, {
      headers: { authorization: 'Bearer valid' },
    });
    const body = await response.json();
    assert.equal(body.cached, false);
    assert.deepEqual(body.summary, complete);
  });
  assert.equal(generatedCount, 1);
});
