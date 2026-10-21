// The "Continue" page for links in Bunari's emails (bunari.app/link#<Supabase link>).
// Email scanners open links to check them, which used up the one-time sign-in links ("expired or
// already used", 2026-10-07). The emails now point here instead: the page only reads the address after
// "#" (never sent to the server), and the real link opens only when the person taps Continue.
// Only this project's Supabase verify address is accepted, so the page cannot send anyone elsewhere.
export const supabaseVerifyPrefix = 'https://qvgdmohmxbrvaulgqgis.supabase.co/auth/v1/verify?';

const titles = {
  email_change: 'Confirm your new email',
  recovery: 'Reset your password',
  signup: 'Confirm your email',
};

// The Supabase link from the part after "#", or null if it is missing or not this project's.
export function continueTarget(hash) {
  let value = String(hash ?? '')
    .replace(/^#/, '')
    .trim();
  // Email apps may hand it over percent-encoded once.
  if (/^https%3A/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  value = value.replace(/&amp;/g, '&');
  if (!value.startsWith(supabaseVerifyPrefix) || /[\s"'<>\\]/.test(value)) return null;
  const type = new URLSearchParams(value.slice(supabaseVerifyPrefix.length)).get('type');
  return { title: titles[type] ?? 'Continue to Bunari', url: value };
}

if (typeof document !== 'undefined') {
  const target = continueTarget(location.hash);
  const button = document.getElementById('continue');
  const title = document.getElementById('link-title');
  const problem = document.getElementById('link-problem');
  if (target && button && title) {
    title.textContent = target.title;
    button.setAttribute('href', target.url);
    button.hidden = false;
  } else if (problem) {
    problem.hidden = false;
  }
  // The token stays out of the address bar and history once read.
  history.replaceState(null, '', location.pathname);
}
