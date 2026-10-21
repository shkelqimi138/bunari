// Sign in with Apple is available only on iOS; other platforms cannot confirm an Apple account again
export async function requestAppleIdentityToken(): Promise<{
  authorizationCode: string | null;
  cancelled: boolean;
  token: string | null;
}> {
  return { authorizationCode: null, cancelled: false, token: null };
}
