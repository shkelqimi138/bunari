// Screen for choosing a new password from a reset link
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AuthButton, AuthField, AuthMessage, AuthShell } from '@/components/auth/auth-ui';
import { AppText } from '@/components/ui/app-text';
import { passwordPlaceholder, passwordProblem, passwordRuleHint } from '@/lib/auth/password-rule';
import { resetScreen } from '@/lib/auth/reset-screen';
import { useAuth } from '@/state/auth-context';
import { spacing } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const { authLinkPending, completePasswordRecovery, isPasswordRecovery, session, signOut, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);
    const result = await updatePassword(password);
    if (result.error) {
      setLoading(false);
      setError(result.error);
      return;
    }
    // The reset link's session is ended (on every device), so the new password is used to log in.
    await signOut();
    completePasswordRecovery();
    setLoading(false);
    router.replace({ pathname: '/auth/sign-in', params: { notice: 'password-changed' } });
  }

  const screen = resetScreen({ authLinkPending, hasSession: Boolean(session), isPasswordRecovery });
  if (screen === 'checking') {
    return (
      <AuthShell subtitle="This takes a moment." title="Checking your link…">
        <AuthMessage tone="success">Your reset link is being checked.</AuthMessage>
      </AuthShell>
    );
  }
  if (screen === 'link-required') {
    return (
      <AuthShell
        subtitle="Open the password reset link sent to your email, then return here."
        title="Reset link required"
      >
        <AuthMessage>There is no active password recovery session.</AuthMessage>
        {/* A used or expired link lands here; ask for a new one instead of stopping. */}
        <AuthButton onPress={() => router.replace('/auth/forgot-password')}>Request a new link</AuthButton>
        <Link href="/auth/sign-in" asChild replace>
          <Pressable accessibilityRole="link" style={styles.back}>
            <AppText color="accent">Back to sign in</AppText>
          </Pressable>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Choose a new password for your account." title="Choose a password">
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      <AuthField
        autoCapitalize="none"
        autoComplete="new-password"
        hint={passwordRuleHint}
        label="New password"
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
      <AuthButton disabled={!password || !confirmPassword} loading={loading} onPress={() => void submit()}>
        Save new password
      </AuthButton>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'center', paddingVertical: spacing[2] },
});
