import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { describeAuthLinkError, readAuthLink, signUpLinkMark } from '../src/lib/auth/auth-link.ts';

const expired = 'This email link has expired or was already used. Request a new one from the sign-in screen.';

test('the expired-link redirect from the device report becomes a readable message', () => {
  const url =
    'bunari://**?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired';
  assert.deepEqual(readAuthLink(url), { kind: 'error', message: expired });
});

test('errors in the fragment are recognised too', () => {
  const url =
    'bunari:///#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  assert.deepEqual(readAuthLink(url), { kind: 'error', message: expired });
});

test('unknown or missing error codes fall back to an invalid-link message', () => {
  assert.deepEqual(readAuthLink('bunari://?error=server_error'), {
    kind: 'error',
    message: 'This email link is invalid. Request a new one from the sign-in screen.',
  });
});

test('PKCE device mismatch explains where to open the link', () => {
  assert.match(describeAuthLinkError('flow_state_not_found'), /device where you requested it/);
  assert.match(describeAuthLinkError('bad_code_verifier'), /device where you requested it/);
});

test('email-change confirmation and recovery links are passed through', () => {
  assert.deepEqual(readAuthLink('bunari:///?code=abc123'), { code: 'abc123', kind: 'code', recovery: false });
  assert.deepEqual(readAuthLink('bunari://auth/reset-password?code=abc123&type=recovery'), {
    code: 'abc123',
    kind: 'code',
    recovery: true,
  });
});

test('sign-up confirmation links never sign in; the Sign in screen says the email is confirmed (user, 2026-10-09)', () => {
  assert.equal(signUpLinkMark, 'signup');
  assert.deepEqual(readAuthLink('bunari://auth/sign-in?link=signup&code=abc123'), { kind: 'confirmed' });
  // An expired or already used sign-up link still says so.
  assert.deepEqual(readAuthLink('bunari://auth/sign-in?link=signup&error=access_denied&error_code=otp_expired'), {
    kind: 'error',
    message: expired,
  });
});

test('sign-up asks Supabase to return to the Sign in screen with the sign-up mark', async () => {
  const source = await readFile(new URL('../src/state/auth-context.tsx', import.meta.url), 'utf8');
  const signUp = source.slice(source.indexOf('signUp: async'), source.indexOf('updatePassword: async'));
  assert.match(
    signUp,
    /emailRedirectTo: Linking\.createURL\('\/auth\/sign-in', \{ queryParams: \{ link: signUpLinkMark \} \}\)/,
  );
  // Email changes still return to the app's start and sign in with their code.
  assert.match(
    source,
    /updateUser\(\s*\{ email: newEmail\.trim\(\) \},\s*\{ emailRedirectTo: Linking\.createURL\('\/'\) \},?\s*\)/,
  );
});

test('links carrying raw session tokens are never used to sign in', () => {
  assert.deepEqual(readAuthLink('bunari:///#access_token=a&refresh_token=r&type=recovery'), { kind: 'none' });
  assert.deepEqual(readAuthLink('bunari:///?access_token=a&refresh_token=r'), { kind: 'none' });
});

test('ordinary app links and empty values are ignored', () => {
  assert.deepEqual(readAuthLink('bunari:///'), { kind: 'none' });
  assert.deepEqual(readAuthLink('bunari://entry/new'), { kind: 'none' });
  assert.deepEqual(readAuthLink(null), { kind: 'none' });
});

test('the reset screen waits while a link is checked, then shows the form or asks for a new link (code review, 2026-10-07)', async () => {
  const { resetScreen } = await import('../src/lib/auth/reset-screen.ts');
  // A valid link being exchanged: no "Request a new link" button that could throw it away.
  assert.equal(resetScreen({ authLinkPending: true, hasSession: false, isPasswordRecovery: false }), 'checking');
  assert.equal(resetScreen({ authLinkPending: true, hasSession: true, isPasswordRecovery: false }), 'checking');
  // The link worked.
  assert.equal(resetScreen({ authLinkPending: false, hasSession: true, isPasswordRecovery: true }), 'form');
  assert.equal(resetScreen({ authLinkPending: true, hasSession: true, isPasswordRecovery: true }), 'form');
  // The link failed or was never opened.
  assert.equal(resetScreen({ authLinkPending: false, hasSession: false, isPasswordRecovery: false }), 'link-required');
  assert.equal(resetScreen({ authLinkPending: false, hasSession: true, isPasswordRecovery: false }), 'link-required');
});
