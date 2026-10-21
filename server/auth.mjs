// Verifies Supabase access tokens for authenticated API requests
export function createSupabaseAuthenticator({ supabasePublishableKey, supabaseUrl }) {
  return async function authenticate(authorization) {
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice(7).trim();
    if (!token) return null;

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabasePublishableKey,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`Supabase authentication failed with ${response.status}`);

    const user = await response.json();
    if (typeof user?.id !== 'string') return null;
    // The Apple user ID linked to this account, if any (used to check whose Apple tokens are revoked).
    const apple = Array.isArray(user.identities)
      ? user.identities.find((identity) => identity?.provider === 'apple')
      : null;
    const appleSubject =
      [apple?.identity_data?.sub, apple?.provider_id, apple?.id].find((value) => typeof value === 'string' && value) ??
      null;
    return { appleSubject, email: user.email ?? null, id: user.id };
  };
}
