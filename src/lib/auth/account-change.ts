// Change email and change password in Account: checks made before asking Supabase, and its answers
// in plain words
import { passwordProblem } from '@/lib/auth/password-rule';

type AuthFailure = { code?: string; message?: string; status?: number };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Why a new email is not accepted, or null.
export function newEmailProblem(newEmail: string, currentEmail: string | null | undefined) {
  const email = newEmail.trim();
  if (!emailPattern.test(email)) return 'Enter a valid email address.';
  if (currentEmail && email.toLowerCase() === currentEmail.toLowerCase()) return 'That is already your email.';
  return null;
}

// Why a password change is not accepted, or null.
export function newPasswordProblem(currentPassword: string, newPassword: string, confirmPassword: string) {
  if (!currentPassword) return 'Enter your current password.';
  const rule = passwordProblem(newPassword);
  if (rule) return rule;
  if (newPassword !== confirmPassword) return 'The new passwords do not match.';
  if (newPassword === currentPassword) return 'The new password is the same as the current one.';
  return null;
}

// The current password is checked by signing in with it again.
export function currentPasswordError(error: AuthFailure) {
  if (error.status === 400) return 'Your current password is not correct.';
  if (error.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  return 'Your account could not be confirmed. Check your connection and try again.';
}

// Supabase's answer to the change itself (https://supabase.com/docs/guides/auth/debugging/error-codes).
export function accountChangeError(error: AuthFailure) {
  switch (error.code) {
    case 'email_exists':
      return 'Another account already uses that email.';
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'same_password':
      return 'The new password is the same as the current one.';
    case 'weak_password':
      return error.message || 'Choose a stronger password.';
    case 'over_email_send_rate_limit':
      return 'Too many emails were sent. Try again in an hour.';
    case 'reauthentication_needed':
      return 'Sign out and in again, then try once more.';
    // Supabase's built-in email sends only to some addresses until Bunari has its own email service.
    case 'email_address_not_authorized':
      return 'Bunari cannot send email to that address yet. Try again later.';
    default:
      if (error.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
      // Any other refusal in Supabase's own words; no status means the request got no answer.
      if (error.status && error.status >= 400 && error.status < 500 && error.message) return error.message;
      if (error.status && error.status >= 500) return 'Something went wrong on the server. Try again later.';
      return 'That did not work. Check your connection and try again.';
  }
}
