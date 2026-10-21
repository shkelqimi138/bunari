// Screen for requesting a password-reset email
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { AuthButton, AuthField, AuthMessage, AuthShell } from '@/components/auth/auth-ui';
import { AppText } from '@/components/ui/app-text';
import { useAuth } from '@/state/auth-context';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset, session } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Redirect href="/" />;

  async function submit() {
    setMessage(null);
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    setMessage(
      result.error
        ? { text: result.error, tone: 'error' }
        : { text: 'Check your email for the password reset link.', tone: 'success' },
    );
  }

  return (
    <AuthShell
      footer={
        <Link href="/auth/sign-in" asChild>
          <Pressable accessibilityRole="link">
            <AppText color="accent">Back to sign in</AppText>
          </Pressable>
        </Link>
      }
      subtitle="We will send a secure reset link to your account email."
      title="Reset password"
    >
      {message ? <AuthMessage tone={message.tone}>{message.text}</AuthMessage> : null}
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
      <AuthButton disabled={!email.trim()} loading={loading} onPress={() => void submit()}>
        Send reset link
      </AuthButton>
    </AuthShell>
  );
}
