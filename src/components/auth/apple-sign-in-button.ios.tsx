// Native Sign in with Apple button for iOS
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/state/auth-context';
import { radii } from '@/theme/tokens';
import type { AppleSignInButtonProps } from './apple-sign-in-button.types';

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export function AppleSignInButton({ onError, onSuccess }: AppleSignInButtonProps) {
  const { signInWithAppleToken } = useAuth();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((supported) => {
      if (active) setAvailable(supported);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  async function signIn() {
    if (loading) return;
    onError(null);
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        onError('Apple did not return a valid identity token.');
        return;
      }

      const result = await signInWithAppleToken(credential.identityToken, credential.fullName);
      if (result.error) onError(result.error);
      else onSuccess();
    } catch (error) {
      if (errorCode(error) !== 'ERR_REQUEST_CANCELED') {
        onError(error instanceof Error ? error.message : 'Apple sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View pointerEvents={loading ? 'none' : 'auto'} style={loading && styles.loading}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        cornerRadius={radii.control}
        onPress={() => void signIn()}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, width: '100%' },
  loading: { opacity: 0.5 },
});
