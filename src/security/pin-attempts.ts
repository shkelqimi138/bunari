// Wrong-PIN limits for Private: growing waits after 5 failures, and PIN unlock is
// blocked after 10 until Face ID or the recovery key is used.

export type PinAttempts = { failures: number; lockedUntil: number | null };

export const noPinAttempts: PinAttempts = { failures: 0, lockedUntil: null };
export const maximumPinFailures = 10;

// Wait after the nth failure, in seconds; failures before the fifth wait nothing.
const waitSeconds = [0, 0, 0, 0, 30, 60, 120, 300, 900];

export function recordPinFailure(attempts: PinAttempts, now: number): PinAttempts {
  const failures = attempts.failures + 1;
  const wait = waitSeconds[failures - 1] ?? 0;
  return { failures, lockedUntil: wait > 0 ? now + wait * 1000 : null };
}

// Why PIN unlock is refused right now, or null when a PIN may be tried.
export function pinLockoutMessage(attempts: PinAttempts, now: number) {
  if (attempts.failures >= maximumPinFailures) {
    return 'Too many wrong PINs. Unlock with Face ID or your recovery key; that also re-enables the PIN.';
  }
  if (attempts.lockedUntil && attempts.lockedUntil > now) {
    const seconds = Math.ceil((attempts.lockedUntil - now) / 1000);
    const wait = seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
    return `Too many wrong PINs. Try again in ${wait}, or unlock with Face ID or your recovery key.`;
  }
  return null;
}
