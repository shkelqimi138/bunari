import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// expo-router reads the `?…` part of links with query-string 7, which decodes with decode-uri-component.
// The root package.json points that at vendor/decode-uri-component, the fixed decoder (GHSA-vcc3-ghjq-m6fr).
const require = createRequire(import.meta.url);
const queryStringPath = require.resolve('query-string', { paths: [require.resolve('expo-router/package.json')] });
const decodePath = createRequire(queryStringPath).resolve('decode-uri-component');
const decode = require(decodePath);
const queryString = require(queryStringPath);

test("expo-router's query-string uses the fixed decoder in vendor/", () => {
  assert.equal(decodePath, fileURLToPath(new URL('../vendor/decode-uri-component/index.js', import.meta.url)));
});

test('decodes like the old 0.2.2, including "+" and broken percent signs', () => {
  // Expected values are what 0.2.2 returned; the fixed 0.5.0 returns the same for each.
  const cases = {
    test: 'test',
    'a+b': 'a b',
    'Email+link+is+invalid+or+has+expired': 'Email link is invalid or has expired',
    '%': '%',
    '%%': '%%',
    'st%C3%A5le': 'ståle',
    'st%C3%A5le%': 'ståle%',
    '%%7Bst%C3%A5le%7D%': '%{ståle}%',
    '%ab%C3%A5le%': '%abåle%',
    '%7B%ab%%7C%de%%7D': '{%ab%|%de%}',
    '%61+%4d%4D': 'a MM',
    '%EF%BB%BFtest': '﻿test',
    '%E2%9C%88%EF%B8%8F': '✈️',
    '%E0%A4%A': '%E0%A4%A',
    '%FE%FF': '��',
    '%C2': '�',
    '%C2%B5%C2': 'µ�',
    '%ZZ': '%ZZ',
    '100%': '100%',
    'a%26b%3Dc': 'a&b=c',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(decode(input), expected, input);
  assert.throws(() => decode(undefined), TypeError);
});

test('a crafted link no longer stalls reading it', () => {
  // With 0.2.2 this 1,203-character value took about 1.8 s on a Mac, growing steeply with its length.
  const crafted = '%E0%A4'.repeat(200) + '%FF';
  const started = performance.now();
  const parsed = queryString.parse(`a=${crafted}`);
  assert.ok(performance.now() - started < 100, 'took too long');
  assert.equal(typeof parsed.a, 'string');
});

test('normal links read the same as before', () => {
  assert.deepEqual(
    {
      ...queryString.parse(
        'code=abc-123_XYZ&error=access_denied&error_description=Email+link+is+invalid&emoji=%E2%9C%88%EF%B8%8F',
      ),
    },
    { code: 'abc-123_XYZ', emoji: '✈️', error: 'access_denied', error_description: 'Email link is invalid' },
  );
  assert.equal(queryString.stringify({ b: '2', a: 'hello world' }, { sort: false }), 'b=2&a=hello%20world');
});
