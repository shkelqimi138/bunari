// Account registration screen
import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthButton, AuthConsentNote, AuthDivider, AuthField, AuthMessage, AuthShell } from '@/components/auth/auth-ui';
import { passwordPlaceholder, passwordProblem, passwordRuleHint } from '@/lib/auth/password-rule';
import { AppText } from '@/components/ui/app-text';
import { useAuth } from '@/state/auth-context';
import { spacing } from '@/theme/tokens';

export default function SignUpScreen() {
  const { session, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Redirect href="/" />;

  async function submit() {
    const problem = passwordProblem(password);
    if (problem) {
      setMessage({ text: problem, tone: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: 'Passwords do not match.', tone: 'error' });
      return;
    }

    setMessage(null);
    setLoading(true);
    const result = await signUp(email, password);
    setLoading(false);

    if (result.error) setMessage({ text: result.error, tone: 'error' });
    else if (result.confirmationRequired) {
      setMessage({ text: 'Check your email to confirm your account.', tone: 'success' });
    } else router.replace('/');
  }

  return (
    <AuthShell
      footer={
        <View style={styles.footerRow}>
          <AppText color="dim">Already registered?</AppText>
          <Link href="/auth/sign-in" asChild>
            <Pressable accessibilityRole="link">
              <AppText color="accent">Sign in</AppText>
            </Pressable>
          </Link>
        </View>
      }
      subtitle="Create the account that will own and protect your journal."
      title="Create account"
    >
      {message ? <AuthMessage tone={message.tone}>{message.text}</AuthMessage> : null}
      <AppleSignInButton
        onError={(error) => setMessage(error ? { text: error, tone: 'error' } : null)}
        onSuccess={() => router.replace('/')}
      />
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
        autoComplete="new-password"
        hint={passwordRuleHint}
        label="Password"
        onChangeText={setPassword}
        placeholder={passwordPlaceholder}
        secureTextEntry
        textContentType="newPassword"
        value={password}
      />
      <AuthField
        autoCapitalize="none"
        autoComplete="new-password"
        label="Confirm password"
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        value={confirmPassword}
      />
      <AuthButton
        disabled={!email.trim() || !password || !confirmPassword}
        loading={loading}
        onPress={() => void submit()}
      >
        Create account
      </AuthButton>
      <AuthConsentNote />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', gap: spacing[2] },
});
