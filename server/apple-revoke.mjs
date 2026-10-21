// Revokes a user's Sign in with Apple tokens when they delete their profile (Apple TN3194)
import { createPrivateKey, createSign } from 'node:crypto';

const appleAuthUrl = 'https://appleid.apple.com';

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

// The `sub` (Apple user ID) of an ID token that came straight from Apple's token endpoint over HTTPS.
function idTokenSubject(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// Null when the Sign in with Apple key is not set up (then profiles are still deleted, without revoking).
// `privateKey` is the .p8 file's text; Railway variables may hold it with real or escaped line breaks.
export function createAppleTokenRevoker({
  clientId,
  fetchImpl = fetch,
  keyId,
  now = () => Date.now(),
  privateKey,
  teamId,
}) {
  if (!clientId || !keyId || !privateKey || !teamId) return null;
  let key;
  try {
    key = createPrivateKey(privateKey.replace(/\\n/g, '\n'));
  } catch {
    // Never prints the key itself.
    console.warn('APPLE_PRIVATE_KEY is not a valid private key, so Sign in with Apple tokens will not be revoked.');
    return null;
  }

  function clientSecret() {
    const issuedAt = Math.floor(now() / 1000);
    const unsigned = `${base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${base64Url(
      JSON.stringify({
        aud: appleAuthUrl,
        exp: issuedAt + 300,
        iat: issuedAt,
        iss: teamId,
        sub: clientId,
      }),
    )}`;
    const signature = createSign('SHA256').update(unsigned).sign({ dsaEncoding: 'ieee-p1363', key });
    return `${unsigned}.${signature.toString('base64url')}`;
  }

  async function post(path, fields) {
    return fetchImpl(`${appleAuthUrl}${path}`, {
      body: new URLSearchParams(fields).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  }

  return {
    // Exchanges the authorization code from the app's fresh Sign in with Apple for a token, checks that
    // it is this account's Apple ID, and revokes it. Returns whether it was revoked; never throws.
    async revoke({ appleSubject, authorizationCode }) {
      try {
        const secret = clientSecret();
        const tokenResponse = await post('/auth/token', {
          client_id: clientId,
          client_secret: secret,
          code: authorizationCode,
          grant_type: 'authorization_code',
        });
        if (!tokenResponse.ok) return false;
        const tokens = await tokenResponse.json();
        if (!appleSubject || idTokenSubject(tokens.id_token) !== appleSubject) return false;
        const token = tokens.refresh_token ?? tokens.access_token;
        if (typeof token !== 'string' || !token) return false;
        const revokeResponse = await post('/auth/revoke', {
          client_id: clientId,
          client_secret: secret,
          token,
          token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
        });
        return revokeResponse.ok;
      } catch {
        return false;
      }
    },
  };
}
