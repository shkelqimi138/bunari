// Start route that sends the user to sign-in or the main tabs
import { Redirect } from 'expo-router';

import { useAuth } from '@/state/auth-context';

export default function IndexRoute() {
  const { isPasswordRecovery, session } = useAuth();

  if (isPasswordRecovery) return <Redirect href="/auth/reset-password" />;
  return <Redirect href={session ? '/(tabs)' : '/auth/sign-in'} />;
}
