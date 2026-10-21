// Which password-reset screen to show: the new-password form, "Checking your link…" while an email link
// is still being handled, or the screen that offers a new link. Without the middle step, a valid link
// briefly showed "Request a new link", and tapping it threw the link away (code review, 2026-10-07).
export type ResetScreen = 'checking' | 'form' | 'link-required';

export function resetScreen({
  authLinkPending,
  hasSession,
  isPasswordRecovery,
}: {
  authLinkPending: boolean;
  hasSession: boolean;
  isPasswordRecovery: boolean;
}): ResetScreen {
  if (hasSession && isPasswordRecovery) return 'form';
  return authLinkPending ? 'checking' : 'link-required';
}
