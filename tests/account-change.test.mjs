import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountChangeError,
  currentPasswordError,
  newEmailProblem,
  newPasswordProblem,
} from '../src/lib/auth/account-change.ts';
import { readAuthLink } from '../src/lib/auth/auth-link.ts';

test('a new email must be a real address and not the current one', () => {
  assert.equal(newEmailProblem('new@example.com', 'old@example.com'), null);
  assert.equal(newEmailProblem('  new@example.com ', 'old@example.com'), null);
  assert.equal(newEmailProblem('not-an-email', 'old@example.com'), 'Enter a valid email address.');
  assert.equal(newEmailProblem('Old@Example.com', 'old@example.com'), 'That is already your email.');
});

test('a new password needs the current one, the password rule, a match, and a change', () => {
  assert.equal(newPasswordProblem('', 'New-passw0rd', 'New-passw0rd'), 'Enter your current password.');
  assert.equal(newPasswordProblem('current-pass', 'Sh0rt!', 'Sh0rt!'), 'Use a password with at least 8 characters.');
  assert.equal(
    newPasswordProblem('current-pass', 'new-password', 'new-password'),
    'Add an uppercase letter and a number to the password.',
  );
  assert.equal(newPasswordProblem('current-pass', 'New-passw0rd', 'New-passw0rD'), 'The new passwords do not match.');
  assert.equal(
    newPasswordProblem('Same-passw0rd', 'Same-passw0rd', 'Same-passw0rd'),
    'The new password is the same as the current one.',
  );
  assert.equal(newPasswordProblem('current-pass', 'New-passw0rd', 'New-passw0rd'), null);
});

test('server answers read in plain words', () => {
  assert.equal(currentPasswordError({ status: 400 }), 'Your current password is not correct.');
  assert.equal(currentPasswordError({ status: 429 }), 'Too many attempts. Wait a few minutes and try again.');
  assert.equal(accountChangeError({ code: 'email_exists' }), 'Another account already uses that email.');
  assert.equal(
    accountChangeError({ code: 'over_email_send_rate_limit' }),
    'Too many emails were sent. Try again in an hour.',
  );
  assert.equal(
    accountChangeError({ code: 'weak_password', message: 'Password should contain a number.' }),
    'Password should contain a number.',
  );
  assert.equal(
    accountChangeError({ code: 'email_address_not_authorized', message: 'Email address not authorized', status: 400 }),
    'Bunari cannot send email to that address yet. Try again later.',
  );
  // Other refusals keep Supabase's words; only a missing answer blames the connection.
  assert.equal(
    accountChangeError({
      code: 'validation_failed',
      message: 'Unable to validate email address: invalid format',
      status: 400,
    }),
    'Unable to validate email address: invalid format',
  );
  assert.equal(
    accountChangeError({ code: 'unexpected_failure', status: 500 }),
    'Something went wrong on the server. Try again later.',
  );
  assert.equal(
    accountChangeError({ message: 'Network request failed', status: 0 }),
    'That did not work. Check your connection and try again.',
  );
});

test('the first of the two email-change links says what is left; a code link still signs in', () => {
  const first = 'bunari://?message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email';
  assert.deepEqual(readAuthLink(first), {
    kind: 'notice',
    message: 'Almost done: now open the confirmation link sent to your other email address.',
  });
  assert.deepEqual(readAuthLink('bunari://?code=abc&message=anything'), { code: 'abc', kind: 'code', recovery: false });
});
