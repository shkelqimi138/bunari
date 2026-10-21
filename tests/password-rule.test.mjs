import assert from 'node:assert/strict';
import { test } from 'node:test';

import { passwordProblem, passwordRuleHint, passwordSymbols } from '../src/lib/auth/password-rule.ts';

test('a new password needs 8 characters with a lowercase and an uppercase letter, a number and a symbol (user, 2026-10-08)', () => {
  assert.equal(passwordProblem('Journal#2026'), null);
  assert.equal(passwordProblem('aB3!efgh'), null, 'exactly 8 characters is enough');
  assert.equal(passwordProblem('aB3!efg'), 'Use a password with at least 8 characters.');
  assert.equal(
    passwordProblem('journal'),
    'Use a password with at least 8 characters, including an uppercase letter, a number and a symbol such as ! ? # or @.',
  );
  assert.equal(passwordProblem('journal#2026'), 'Add an uppercase letter to the password.');
  assert.equal(passwordProblem('JOURNAL#2026'), 'Add a lowercase letter to the password.');
  assert.equal(passwordProblem('Journal#Days'), 'Add a number to the password.');
  assert.equal(passwordProblem('Journal2026'), 'Add a symbol such as ! ? # or @ to the password.');
  assert.match(passwordRuleHint, /8 characters, with an uppercase and a lowercase letter, a number and a symbol/);
});

test("only Supabase's symbols count, so the app never accepts a password Supabase refuses", () => {
  // Supabase's "Lowercase, uppercase letters, digits and symbols" set (docs, password security, 2026-10-08).
  assert.equal(passwordSymbols, '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~');
  for (const symbol of passwordSymbols) assert.equal(passwordProblem(`Journal2026${symbol}`), null, symbol);
  assert.notEqual(passwordProblem('Journal2026€'), null, '€ is not one of them');
  assert.notEqual(passwordProblem('Journal 2026'), null, 'a space is not one of them');
  assert.equal(
    passwordProblem('Öurnal#2026'),
    'Add an uppercase letter to the password.',
    'letters outside A–Z do not count',
  );
});
