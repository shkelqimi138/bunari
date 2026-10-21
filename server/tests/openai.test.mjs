import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AiUnavailableError,
  completeMoodReason,
  completePrompt,
  completeWeeklySummary,
  createOpenAi,
} from '../openai.mjs';

function responseWith(value) {
  return async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
}

test('validates daily prompt output', async () => {
  const ai = createOpenAi({
    apiKey: 'test',
    fetchImpl: responseWith({ minutes: 7, prompt: 'What felt unexpectedly meaningful today?' }),
  });
  assert.deepEqual(await ai.dailyPrompt({ localDate: '2026-09-04' }), {
    minutes: 7,
    prompt: 'What felt unexpectedly meaningful today?',
  });
});

test('uses strict structured output without storing the response', async () => {
  let requestBody;
  const ai = createOpenAi({
    apiKey: 'test',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return responseWith({ mood: 'Calm', reason: 'The entry describes a quiet moment.' })();
    },
  });
  await ai.moodSuggestion({ description: '', plainText: 'A quiet morning.', title: 'Morning' });
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.type, 'json_schema');
});

test('rejects mood values outside the app taxonomy', async () => {
  const ai = createOpenAi({
    apiKey: 'test',
    fetchImpl: responseWith({ mood: 'Excited', reason: 'Invalid taxonomy.' }),
  });
  await assert.rejects(
    () => ai.moodSuggestion({ description: '', plainText: 'A day.', title: 'Today' }),
    AiUnavailableError,
  );
});

test('does not call OpenAI without a server key', async () => {
  const ai = createOpenAi({ apiKey: null });
  await assert.rejects(() => ai.dailyPrompt({ localDate: '2026-09-04' }), AiUnavailableError);
});

test('a daily prompt must be a finished English sentence', () => {
  assert.equal(completePrompt('What felt unexpectedly meaningful today?'), 'What felt unexpectedly meaningful today?');
  assert.equal(
    completePrompt('Describe a small “win” from this week — and why it mattered.'),
    'Describe a small “win” from this week — and why it mattered.',
  );
  assert.equal(completePrompt('Then reflect: what does this 순간'), null, 'a stray word in another script');
  assert.equal(completePrompt('Then reflect: what does this moment'), null, 'cut off mid-sentence');
  assert.equal(completePrompt(`${'a'.repeat(240)}?`), null, 'too long for the prompt card');
});

test('an invalid daily prompt is requested once more, then reported as unavailable', async () => {
  const replies = [
    { minutes: 10, prompt: 'On a blank page, write about a moment. Then reflect: what does this 순간' },
    { minutes: 6, prompt: 'Which small moment this week changed your mood, and why?' },
  ];
  let calls = 0;
  const retrying = createOpenAi({ apiKey: 'test', fetchImpl: async () => responseWith(replies[calls++])() });
  assert.deepEqual(await retrying.dailyPrompt({ localDate: '2026-09-30' }), {
    minutes: 6,
    prompt: 'Which small moment this week changed your mood, and why?',
  });
  assert.equal(calls, 2);

  calls = 0;
  const failing = createOpenAi({
    apiKey: 'test',
    fetchImpl: async () => {
      calls += 1;
      return responseWith(replies[0])();
    },
  });
  await assert.rejects(() => failing.dailyPrompt({ localDate: '2026-09-30' }), AiUnavailableError);
  assert.equal(calls, 2);
});

test('a mood reason cut off mid-word is requested once more, then reported as unavailable', async () => {
  const replies = [
    { mood: 'Calm', reason: 'The entry describes a quiet evening walk and a slow, unhur' },
    { mood: 'Calm', reason: 'The entry describes a quiet evening walk.' },
  ];
  let calls = 0;
  let requestBody;
  const retrying = createOpenAi({
    apiKey: 'test',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return responseWith(replies[calls++])();
    },
  });
  assert.deepEqual(await retrying.moodSuggestion({ description: '', plainText: 'A walk.', title: 'Evening' }), {
    mood: 'Calm',
    reason: 'The entry describes a quiet evening walk.',
  });
  assert.equal(calls, 2);
  assert.equal(
    requestBody.text.format.schema.properties.reason.maxLength,
    undefined,
    'no hard length limit that cuts the reason',
  );

  calls = 0;
  const failing = createOpenAi({
    apiKey: 'test',
    fetchImpl: async () => {
      calls += 1;
      return responseWith(replies[0])();
    },
  });
  await assert.rejects(
    () => failing.moodSuggestion({ description: '', plainText: 'A walk.', title: 'Evening' }),
    AiUnavailableError,
  );
  assert.equal(calls, 2);
});

test('a weekly summary must be made of finished sentences', () => {
  const complete = {
    encouragement: 'Keep going.',
    headline: 'A steady week',
    overview: 'You wrote often.',
    patterns: ['Daily notes.', 'Evening walks!'],
  };
  assert.deepEqual(completeWeeklySummary(complete), complete);
  assert.equal(
    completeWeeklySummary({ ...complete, overview: 'You wrote about work and the conversation that chang' }),
    null,
    'cut overview',
  );
  assert.equal(
    completeWeeklySummary({ ...complete, patterns: ['Daily notes.', 'Evenings spent'] }),
    null,
    'cut pattern',
  );
  assert.equal(completeWeeklySummary({ ...complete, encouragement: '' }), null, 'missing encouragement');
  assert.equal(completeWeeklySummary(null), null);
});

test('a mood reason is up to 240 characters of finished English sentences', () => {
  const twoSentences =
    'The entry shows strong frustration and ongoing tension about relationships. It also mentions feeling stuck, which fits a restless mood.';
  assert.equal(completeMoodReason(twoSentences), twoSentences);
  assert.equal(
    completeMoodReason(
      'The entry shows strong frustration, anger, and ongoing tension about relationships and life circumstances, along with a困',
    ),
    null,
    'cut off with a stray character',
  );
  assert.equal(completeMoodReason('The entry feels tense 困难.'), null, 'another script inside a finished sentence');
  assert.equal(completeMoodReason(`${'a'.repeat(240)}.`), null, 'too long');
});
