// Password rule shown and checked on sign-up, password reset and Change password. It matches
// Supabase's Authentication settings (minimum length 8, and "Lowercase, uppercase letters, digits
// and symbols"; user, 2026-10-08), so the app explains what is missing before Supabase refuses.
// Signing in is never checked: older passwords keep working until they are changed.
export const minimumPasswordLength = 8;
// Supabase's symbols for that setting; other characters (such as € or a space) do not count.
export const passwordSymbols = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';
export const passwordPlaceholder = `At least ${minimumPasswordLength} characters`;
export const passwordRuleHint = `At least ${minimumPasswordLength} characters, with an uppercase and a lowercase letter, a number and a symbol such as ! ? # or @`;

function listOf(parts: string[]) {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

// Why a new password is not accepted, or null. Supabase enforces its own setting too.
export function passwordProblem(password: string) {
  const missing = [
    /[a-z]/.test(password) ? null : 'a lowercase letter',
    /[A-Z]/.test(password) ? null : 'an uppercase letter',
    /[0-9]/.test(password) ? null : 'a number',
    [...password].some((character) => passwordSymbols.includes(character)) ? null : 'a symbol such as ! ? # or @',
  ].filter((part): part is string => part !== null);
  if (password.length < minimumPasswordLength) {
    return `Use a password with at least ${minimumPasswordLength} characters${missing.length ? `, including ${listOf(missing)}` : ''}.`;
  }
  if (missing.length) return `Add ${listOf(missing)} to the password.`;
  return null;
}
