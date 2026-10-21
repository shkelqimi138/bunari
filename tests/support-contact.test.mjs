import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { supportEmail } from '../src/config/website.ts';
import { appVersionLabel, supportMailUrl } from '../src/domain/support.ts';

test('the version reads like TestFlight: version and build', () => {
  assert.equal(appVersionLabel('1.0.1', '9'), '1.0.1 (9)');
  assert.equal(appVersionLabel('1.0.1', null), '1.0.1');
  assert.equal(appVersionLabel(null, '9'), 'Unknown');
});

test('a support email has the subject and the versions, and nothing else from the app', () => {
  const url = supportMailUrl('help@example.com', { appVersion: '1.0.1', buildNumber: '9', osVersion: '27.0' });
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'mailto:');
  assert.equal(parsed.pathname, 'help@example.com');
  assert.deepEqual([...parsed.searchParams.keys()], ['subject', 'body']);
  assert.equal(parsed.searchParams.get('subject'), 'Bunari support');
  assert.equal(parsed.searchParams.get('body'), '\n\n—\nBunari 1.0.1 (9), iOS 27.0');
});

test('the app and the website use the same contact address (user, 2026-10-07)', () => {
  assert.equal(supportEmail, 'contact@bunari.app');
  const site = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
  assert.ok(!site.includes('[support email]'), 'no placeholder left');
  const addresses = new Set(site.match(/[\w.+-]+@[\w-]+\.[\w.]+/g));
  assert.deepEqual([...addresses], [supportEmail]);
});
