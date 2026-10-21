// Sign-in screen with email/password and Sign in with Apple
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthButton, AuthConsentNote, AuthDivider, AuthField, AuthMessage, AuthShell } from '@/components/auth/auth-ui';
import { AppText } from '@/components/ui/app-text';
import { useAuth } from '@/state/auth-context';
import { spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const { emailConfirmed, session, signIn } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Redirect href="/" />;

  async function submit() {
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) setError(result.error);
    else router.replace('/');
  }

  return (
    <AuthShell
      footer={
        <View style={styles.footerRow}>
          <AppText color="dim">New here?</AppText>
          <Link href="/auth/sign-up" asChild>
            <Pressable accessibilityRole="link">
              <AppText color="accent">Create account</AppText>
            </Pressable>
          </Link>
        </View>
      }
      subtitle="Your entries stay tied to your private account."
      title="Welcome back"
    >
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {!error && notice === 'password-changed' ? (
        <AuthMessage tone="success">Password changed. Log in with your new password.</AuthMessage>
      ) : null}
      {!error && emailConfirmed ? (
        <AuthMessage tone="success">Email confirmed. Sign in to continue.</AuthMessage>
      ) : null}
      <AppleSignInButton onError={setError} onSuccess={() => router.replace('/')} />
      <AuthDivider />
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        textContentType="emailAddress"
        value={email}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="current-password"
        label="Password"
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        value={password}
      />
      <Link href="/auth/forgot-password" asChild>
        <Pressable accessibilityRole="link" style={styles.forgot}>
          <AppText color="accent">Forgot password?</AppText>
        </Pressable>
      </Link>
      <AuthButton disabled={!email.trim() || !password} loading={loading} onPress={() => void submit()}>
        Sign in
      </AuthButton>
      {/* Sign in with Apple above can also create a new account. */}
      <AuthConsentNote />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', gap: spacing[2] },
  forgot: { alignSelf: 'flex-end', marginTop: -spacing[2] },
});
