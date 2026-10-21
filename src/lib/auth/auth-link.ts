// Parses Supabase email links and describes link errors (expired, invalid)
export type AuthLink =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  // A link that only confirms a step, e.g. the first of the two email-change links.
  | { kind: 'notice'; message: string }
  // A sign-up confirmation: the email is confirmed, and the person signs in themselves.
  | { kind: 'confirmed' }
  | { code: string; kind: 'code'; recovery: boolean };

export const authLinkErrorTitle = 'Link not valid';

// Sign-up asks Supabase to return to `bunari://auth/sign-in?link=signup`. Supabase has confirmed the
// email before it opens the app, so the app does not sign in with the link's code; the Sign in screen
// says the email is confirmed instead (user, 2026-10-09). This also works when the link is opened on
// another device, where the code could not be used anyway.
export const signUpLinkMark = 'signup';

// Supabase error codes for email links: https://supabase.com/docs/guides/auth/debugging/error-codes
export function describeAuthLinkError(code: string | null | undefined) {
  switch (code) {
    case 'otp_expired':
      return 'This email link has expired or was already used. Request a new one from the sign-in screen.';
    case 'bad_code_verifier':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return 'This email link has expired or must be opened on the device where you requested it. Request a new one from the sign-in screen.';
    default:
      return 'This email link is invalid. Request a new one from the sign-in screen.';
  }
}

function linkParameters(url: string) {
  // Parsed by hand: Supabase may redirect to addresses such as `bunari://**?…`
  // that the URL constructor rejects. Query values win over fragment values.
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const parameters = new URLSearchParams(hashIndex >= 0 ? url.slice(hashIndex + 1) : '');
  for (const [key, value] of new URLSearchParams(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '')) {
    parameters.set(key, value);
  }
  return parameters;
}

export function readAuthLink(url: string | null | undefined): AuthLink {
  if (!url) return { kind: 'none' };
  const parameters = linkParameters(url);

  if (parameters.has('error') || parameters.has('error_code') || parameters.has('error_description')) {
    return { kind: 'error', message: describeAuthLinkError(parameters.get('error_code')) };
  }

  if (parameters.get('link') === signUpLinkMark) return { kind: 'confirmed' };

  const recovery = parameters.get('type') === 'recovery';
  const code = parameters.get('code');
  if (code) return { code, kind: 'code', recovery };

  // Changing the email asks for both addresses to confirm (Supabase's secure email change); the
  // first link only says so.
  const message = parameters.get('message');
  if (message) {
    return {
      kind: 'notice',
      message: /other email/i.test(message)
        ? 'Almost done: now open the confirmation link sent to your other email address.'
        : 'Email link accepted.',
    };
  }

  // Links carrying raw session tokens are ignored: the app signs in only through PKCE
  // codes, which work solely on the device that requested them. Accepting tokens would
  // let a crafted link sign the user into someone else's account.
  return { kind: 'none' };
}
