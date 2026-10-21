import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { continueTarget, supabaseVerifyPrefix } from '../website/link.mjs';

// What Supabase puts in {{ .ConfirmationURL }}: its verify address with a one-time token and the app link.
const link = (type) =>
  `${supabaseVerifyPrefix}token=pkce_abc123&type=${type}&redirect_to=bunari%3A%2F%2F%2Fauth%2Freset-password`;

test("the page accepts only this project's Supabase verify link, and names the step", () => {
  assert.match(supabaseVerifyPrefix, /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\/v1\/verify\?$/);
  assert.deepEqual(continueTarget(`#${link('recovery')}`), { title: 'Reset your password', url: link('recovery') });
  assert.equal(continueTarget(`#${link('signup')}`).title, 'Confirm your email');
  assert.equal(continueTarget(`#${link('email_change')}`).title, 'Confirm your new email');
  // Handed over percent-encoded once, or with the &amp; an HTML email may leave in.
  assert.equal(continueTarget(`#${encodeURIComponent(link('recovery'))}`).url, link('recovery'));
  assert.equal(continueTarget(`#${link('recovery').replace(/&/g, '&amp;')}`).url, link('recovery'));
});

test('anything else is refused, so the page cannot send people elsewhere', () => {
  for (const hash of [
    '',
    '#',
    '#https://evil.example/auth/v1/verify?token=x',
    '#https://other-project.supabase.co/auth/v1/verify?token=x&type=recovery',
    `#${supabaseVerifyPrefix.replace('https:', 'http:')}token=x`,
    `#javascript:alert(1)//${supabaseVerifyPrefix}`,
    `#${supabaseVerifyPrefix}token=x"><script>`,
    '#https%3A%2F%2Fevil.example%2F',
  ]) {
    assert.equal(continueTarget(hash), null, hash);
  }
});

test('the page waits for a tap: no automatic redirect, and the button starts hidden', () => {
  const html = readFileSync(new URL('../website/link.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../website/link.mjs', import.meta.url), 'utf8');
  assert.match(html, /<a class="store-badge" id="continue" href="\/" hidden>Continue<\/a>/);
  assert.match(html, /<script type="module" src="\/link\.mjs"><\/script>/);
  assert.ok(
    !/location\.(assign|replace)\(|location\.href\s*=|http-equiv="refresh"/.test(html + script),
    'no automatic redirect',
  );
});

// The page accepts one Supabase project, written into link.mjs; if the app's project ever changes, every
// email button would stop working (code review, 2026-10-07). Checked whenever .env is on this Mac.
const envFile = new URL('../.env', import.meta.url);
test(
  'the page accepts the same Supabase project the app uses',
  { skip: existsSync(envFile) ? false : 'no .env on this machine' },
  () => {
    const match = /^EXPO_PUBLIC_SUPABASE_URL=["']?([^"'\s]+)/m.exec(readFileSync(envFile, 'utf8'));
    assert.ok(match, 'EXPO_PUBLIC_SUPABASE_URL is set');
    assert.equal(supabaseVerifyPrefix, `${match[1].replace(/\/+$/, '')}/auth/v1/verify?`);
  },
);
