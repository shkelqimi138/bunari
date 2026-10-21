import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  maximumPinFailures,
  noPinAttempts,
  pinLockoutMessage,
  recordPinFailure,
} from '../src/security/pin-attempts.ts';

const start = Date.parse('2026-09-25T12:00:00Z');

function fail(times, now = start) {
  let attempts = noPinAttempts;
  for (let index = 0; index < times; index += 1) attempts = recordPinFailure(attempts, now);
  return attempts;
}

test('the first four wrong PINs have no wait', () => {
  const attempts = fail(4);
  assert.equal(attempts.failures, 4);
  assert.equal(pinLockoutMessage(attempts, start), null);
});

test('from the fifth wrong PIN the wait grows', () => {
  const fifth = fail(5);
  assert.match(pinLockoutMessage(fifth, start), /Try again in 30 seconds/);
  assert.equal(pinLockoutMessage(fifth, start + 30_000), null, 'the PIN can be tried again after the wait');
  assert.match(pinLockoutMessage(fail(6), start), /Try again in 60 seconds/);
  assert.match(pinLockoutMessage(fail(8), start), /Try again in 5 minutes/);
  assert.match(pinLockoutMessage(fail(9), start), /Try again in 15 minutes/);
});

test('after ten wrong PINs only Face ID or the recovery key can unlock', () => {
  const blocked = fail(maximumPinFailures);
  const muchLater = start + 30 * 24 * 60 * 60 * 1000;
  assert.match(pinLockoutMessage(blocked, muchLater), /Unlock with Face ID or your recovery key/);
  assert.equal(pinLockoutMessage(noPinAttempts, muchLater), null, 'a successful unlock resets the count');
});
