// Asks Sign in with Apple again (iOS) to confirm it is the account owner before deleting the profile; its
// one-time authorization code lets the server revoke Bunari's Apple tokens once the profile is deleted
import * as AppleAuthentication from 'expo-apple-authentication';

export async function requestAppleIdentityToken(): Promise<{
  authorizationCode: string | null;
  cancelled: boolean;
  token: string | null;
}> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return {
      authorizationCode: credential.authorizationCode ?? null,
      cancelled: false,
      token: credential.identityToken ?? null,
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    return { authorizationCode: null, cancelled: code === 'ERR_REQUEST_CANCELED', token: null };
  }
}
