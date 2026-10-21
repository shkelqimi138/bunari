import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDailyPromptStore,
  dailyPromptLimitRetryDelayMs,
  dailyPromptRetryDelayMs,
} from '../src/data/daily-prompt-store.ts';

const day = '2026-10-05';
const aiPrompt = (date = day, prompt = 'What deserves your full attention today?') => ({
  cached: true,
  date,
  minutes: 6,
  model: 'test',
  prompt,
  provider: 'test',
});

// A loader whose server answers are set per test; it counts the requests and keeps the saved copies.
function fakeLoader({ fetch, saved = {} }) {
  const loader = {
    fetches: 0,
    saved,
    fetch: async (date) => {
      loader.fetches += 1;
      return fetch(date, loader.fetches);
    },
    readCache: async (userId, date) => loader.saved[`${userId}|${date}`] ?? null,
    writeCache: async (userId, date, result) => {
      loader.saved[`${userId}|${date}`] = result;
    },
  };
  return loader;
}

// A clock the tests move forward by hand.
function fakeClock() {
  const clock = {
    now: 0,
    after: (ms) => {
      clock.now += ms;
    },
  };
  return clock;
}

test('a failed first load is tried again, and every screen sees the AI prompt', async () => {
  const loader = fakeLoader({
    fetch: async (date, attempt) => {
      if (attempt === 1) throw new Error('offline');
      return aiPrompt(date);
    },
  });
  const clock = fakeClock();
  const store = createDailyPromptStore(loader, () => clock.now);
  let updates = 0;
  store.subscribe(() => {
    updates += 1;
  });

  await store.load('user-1', day);
  // Only the built-in prompt for now (the bug: this used to stay so on Today).
  assert.deepEqual(store.getSnapshot(), { date: day, remote: null, userId: 'user-1' });

  clock.after(dailyPromptRetryDelayMs);
  await store.load('user-1', day);
  assert.equal(store.getSnapshot().remote.prompt, 'What deserves your full attention today?');
  assert.ok(updates >= 2);
  assert.equal(loader.saved[`user-1|${day}`].prompt, 'What deserves your full attention today?');
});

test('screens loading at the same time share one request', async () => {
  let answer;
  const loader = fakeLoader({
    fetch: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const store = createDailyPromptStore(loader);

  const today = store.load('user-1', day);
  const dailyPromptScreen = store.load('user-1', day);
  await new Promise((resolve) => setImmediate(resolve));
  answer(aiPrompt());
  await Promise.all([today, dailyPromptScreen]);

  assert.equal(loader.fetches, 1);
  assert.equal(store.getSnapshot().remote.prompt, 'What deserves your full attention today?');
});

test('once the AI prompt is shown, showing a screen again does not ask the server', async () => {
  const loader = fakeLoader({ fetch: async (date) => aiPrompt(date) });
  const store = createDailyPromptStore(loader);

  await store.load('user-1', day);
  await store.load('user-1', day);
  await store.load('user-1', day);
  assert.equal(loader.fetches, 1);
});

test('the saved prompt is shown when the server cannot be reached', async () => {
  const loader = fakeLoader({
    fetch: async () => {
      throw new Error('offline');
    },
    saved: { [`user-1|${day}`]: aiPrompt(day, 'Which small moment changed your mood today?') },
  });
  const store = createDailyPromptStore(loader);

  await store.load('user-1', day);
  assert.equal(store.getSnapshot().remote.prompt, 'Which small moment changed your mood today?');
  // A saved copy from another day is never shown.
  await store.load('user-1', '2026-10-06');
  assert.equal(store.getSnapshot().remote, null);
});

test('a late answer for yesterday or another account does not replace the current prompt', async () => {
  const answers = [];
  const loader = fakeLoader({
    fetch: (date) =>
      new Promise((resolve) => {
        answers.push(() => resolve(aiPrompt(date, `Prompt for ${date}`)));
      }),
  });
  const store = createDailyPromptStore(loader);

  const yesterday = store.load('user-1', '2026-10-04');
  const today = store.load('user-2', day);
  await new Promise((resolve) => setImmediate(resolve));
  answers[1]();
  await today;
  answers[0]();
  await yesterday;

  assert.deepEqual(store.getSnapshot(), { date: day, remote: aiPrompt(day, `Prompt for ${day}`), userId: 'user-2' });
});

test('after a failed load the next try waits a minute, so an outage cannot use up the daily AI limit', async () => {
  const loader = fakeLoader({
    fetch: async () => {
      throw Object.assign(new Error('AI is temporarily unavailable.'), { code: 'ai_unavailable' });
    },
  });
  const clock = fakeClock();
  const store = createDailyPromptStore(loader, () => clock.now);

  await store.load('user-1', day);
  // Today shown again and the app brought back, all within the minute: no new request.
  await store.load('user-1', day);
  clock.after(dailyPromptRetryDelayMs - 1);
  await store.load('user-1', day);
  assert.equal(loader.fetches, 1);

  clock.after(1);
  await store.load('user-1', day);
  assert.equal(loader.fetches, 2);
  // The wait is per day: a new day asks at once.
  await store.load('user-1', '2026-10-06');
  assert.equal(loader.fetches, 3);
});

test('once the daily AI limit is reached the next try waits an hour', async () => {
  const loader = fakeLoader({
    fetch: async (date, attempt) => {
      if (attempt === 1)
        throw Object.assign(new Error('Daily AI limit reached. Try again tomorrow.'), { code: 'ai_limit_reached' });
      return aiPrompt(date);
    },
  });
  const clock = fakeClock();
  const store = createDailyPromptStore(loader, () => clock.now);

  await store.load('user-1', day);
  clock.after(dailyPromptRetryDelayMs);
  await store.load('user-1', day);
  assert.equal(loader.fetches, 1);

  clock.after(dailyPromptLimitRetryDelayMs - dailyPromptRetryDelayMs);
  await store.load('user-1', day);
  assert.equal(loader.fetches, 2);
  assert.equal(store.getSnapshot().remote.prompt, 'What deserves your full attention today?');
});
