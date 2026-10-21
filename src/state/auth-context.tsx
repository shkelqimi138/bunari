// Auth provider: session, sign-in/out, email links, email and password changes, and profile deletion
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { mediaCache } from '@/data/media-cache';
import { apiRequest } from '@/lib/api';
import { accountChangeError, currentPasswordError } from '@/lib/auth/account-change';
import { authLinkErrorTitle, describeAuthLinkError, readAuthLink, signUpLinkMark } from '@/lib/auth/auth-link';
import { loadSavedSession } from '@/lib/auth/load-saved-session';
import { reminders } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';
import { privateKeyStore } from '@/security/private-key-store';

type AuthResult = { error: string | null };
// Proof that the account owner is deleting the profile: the account password, or a new Sign in with
// Apple for accounts created with Apple (they have no password).
export type DeleteProfileProof =
  { appleAuthorizationCode: string | null; appleIdentityToken: string } | { password: string };
type SignUpResult = AuthResult & { confirmationRequired: boolean };
type AppleProfileName = {
  familyName: string | null;
  givenName: string | null;
  middleName: string | null;
};

type AuthContextValue = {
  // Both need the current password first; the email changes only once the confirmation link is opened.
  changeEmail: (newEmail: string, currentPassword: string) => Promise<AuthResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  completePasswordRecovery: () => void;
  deleteProfile: (proof: DeleteProfileProof) => Promise<AuthResult>;
  // True after a sign-up confirmation link opened the app, until someone signs in.
  emailConfirmed: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  // True while an email link (sign-up, password reset, email change) is still being handled.
  authLinkPending: boolean;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithAppleToken: (token: string, name: AppleProfileName | null) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// The Apple user ID (`sub`) inside an Apple identity token, read on the device before any sign-in.
function appleTokenSubject(token: string) {
  try {
    const part = token.split('.')[1] ?? '';
    const base64 = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    const { sub } = JSON.parse(globalThis.atob(base64)) as { sub?: unknown };
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  // Starts true until the link that opened the app (if any) has been read.
  const [authLinkPending, setAuthLinkPending] = useState(true);
  const pendingAuthLinks = useRef(0);

  useEffect(() => {
    let active = true;

    void loadSavedSession(
      async () => (await supabase.auth.getSession()).data.session,
      // Only the message: the error object could carry session details.
      (error: unknown) =>
        console.warn('Could not restore the saved session.', error instanceof Error ? error.message : String(error)),
    ).then((restoredSession) => {
      if (active) {
        setSession(restoredSession);
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_IN') setEmailConfirmed(false);
      setIsLoading(false);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    function linkStarted() {
      pendingAuthLinks.current += 1;
      setAuthLinkPending(true);
    }
    function linkFinished() {
      pendingAuthLinks.current = Math.max(0, pendingAuthLinks.current - 1);
      setAuthLinkPending(pendingAuthLinks.current > 0);
    }

    function showLinkError(message: string) {
      setIsPasswordRecovery(false);
      Alert.alert(authLinkErrorTitle, message);
    }

    async function handleAuthUrl(url: string | null) {
      const link = readAuthLink(url);
      if (link.kind === 'none') return;
      if (link.kind === 'error') {
        showLinkError(link.message);
        return;
      }
      if (link.kind === 'notice') {
        Alert.alert('Email change', link.message);
        return;
      }
      // The link itself opens the Sign in screen, which then says the email is confirmed.
      if (link.kind === 'confirmed') {
        setEmailConfirmed(true);
        return;
      }

      if (link.recovery) setIsPasswordRecovery(true);
      linkStarted();
      let result: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;
      let before: User | undefined;
      try {
        before = (await supabase.auth.getSession()).data.session?.user;
        result = await supabase.auth.exchangeCodeForSession(link.code);
      } finally {
        linkFinished();
      }
      const { data, error } = result;
      if (error) {
        showLinkError(describeAuthLinkError(error.code));
        return;
      }
      // The confirmation link of a changed email signs the same account in with its new address; a
      // link for another account (e.g. its password reset) is not an email change.
      const after = data.session?.user;
      if (before?.email && after?.email && before.id === after.id && before.email !== after.email) {
        Alert.alert('Email changed', `Bunari now uses ${after.email}.`);
      }
    }

    linkStarted();
    void Linking.getInitialURL().then(handleAuthUrl).finally(linkFinished);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    // Signs in again with the current password, so someone holding an unlocked phone cannot change
    // the account's email or password.
    async function confirmCurrentPassword(password: string) {
      const email = session?.user.email;
      if (!email) return 'This account has no email address to confirm.';
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? currentPasswordError(error) : null;
    }

    return {
      changeEmail: async (newEmail, currentPassword) => {
        const problem = await confirmCurrentPassword(currentPassword);
        if (problem) return { error: problem };
        const { error } = await supabase.auth.updateUser(
          { email: newEmail.trim() },
          { emailRedirectTo: Linking.createURL('/') },
        );
        return { error: error ? accountChangeError(error) : null };
      },
      changePassword: async (currentPassword, newPassword) => {
        const problem = await confirmCurrentPassword(currentPassword);
        if (problem) return { error: problem };
        // The current password is sent too, in case Supabase is set to require it.
        const { error } = await supabase.auth.updateUser({ current_password: currentPassword, password: newPassword });
        return { error: error ? accountChangeError(error) : null };
      },
      completePasswordRecovery: () => setIsPasswordRecovery(false),
      deleteProfile: async (proof) => {
        const userId = session?.user.id;
        const email = session?.user.email;
        if (!userId) return { error: 'Sign in first.' };
        try {
          // Signing in again proves it is the account owner; the server accepts deletion only
          // within 10 minutes of a real sign-in (a refreshed session is not enough).
          if ('password' in proof) {
            if (!email) return { error: 'This account has no email address to confirm.' };
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: proof.password });
            if (signInError) {
              if (signInError.status === 400) return { error: 'That password is not correct.' };
              if (signInError.status === 429) return { error: 'Too many attempts. Wait a few minutes and try again.' };
              return { error: 'Your account could not be confirmed. Check your connection and try again.' };
            }
          } else {
            // The Apple ID must be the one linked to this account; it is checked on the device first,
            // so a different Apple ID never signs in (or creates an account) in its place.
            const linked = session?.user.identities?.find((identity) => identity.provider === 'apple');
            const linkedSubject =
              typeof linked?.identity_data?.sub === 'string' ? linked.identity_data.sub : linked?.id;
            const subject = appleTokenSubject(proof.appleIdentityToken);
            if (!linkedSubject || !subject || subject !== linkedSubject) {
              return { error: 'That Apple ID is not the one for this account, so nothing was deleted.' };
            }
            const { data, error: signInError } = await supabase.auth.signInWithIdToken({
              provider: 'apple',
              token: proof.appleIdentityToken,
            });
            if (signInError) {
              if (signInError.status === 429) return { error: 'Too many attempts. Wait a few minutes and try again.' };
              return { error: 'Your Apple ID could not be confirmed. Check your connection and try again.' };
            }
            if (data.user?.id !== userId) {
              await supabase.auth.signOut({ scope: 'local' });
              return { error: 'That Apple ID belongs to a different account, so nothing was deleted. Sign in again.' };
            }
          }
          // With Apple's one-time code the server also revokes Bunari's Apple tokens after deleting.
          const appleAuthorizationCode = 'appleAuthorizationCode' in proof ? proof.appleAuthorizationCode : null;
          await apiRequest<{ deleted: true }>(
            '/v1/account',
            appleAuthorizationCode
              ? {
                  body: JSON.stringify({ appleAuthorizationCode }),
                  headers: { 'content-type': 'application/json' },
                  method: 'DELETE',
                }
              : { method: 'DELETE' },
          );
          const keys = await AsyncStorage.getAllKeys();
          const userKeys = keys.filter((key) => key.endsWith(`.${userId}`) || key.includes(`.${userId}.`));
          await Promise.allSettled([
            reminders.disable(userId),
            mediaCache.clearUser(userId),
            privateKeyStore.clear(userId),
            userKeys.length > 0 ? AsyncStorage.multiRemove(userKeys) : Promise.resolve(),
          ]);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          return { error: null };
        } catch (caught) {
          return { error: caught instanceof Error ? caught.message : 'Profile could not be deleted.' };
        }
      },
      emailConfirmed,
      isLoading,
      authLinkPending,
      isPasswordRecovery,
      requestPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: Linking.createURL('/auth/reset-password'),
        });
        return { error: error?.message ?? null };
      },
      session,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error?.message ?? null };
      },
      signInWithAppleToken: async (token, name) => {
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token });
        if (error) return { error: error.message };

        const nameParts = [name?.givenName, name?.middleName, name?.familyName].filter(Boolean);
        if (nameParts.length > 0) {
          const fullName = nameParts.join(' ');
          await Promise.all([
            supabase.auth.updateUser({
              data: {
                family_name: name?.familyName,
                full_name: fullName,
                given_name: name?.givenName,
              },
            }),
            supabase
              .from('profiles')
              .update({ display_name: fullName })
              .eq('id', (await supabase.auth.getUser()).data.user?.id ?? ''),
          ]);
        }

        return { error: null };
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        // A signed-out phone stops reminding; signing in again schedules it from the account setting.
        if (!error && session?.user.id) await reminders.disable(session.user.id).catch(() => undefined);
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: Linking.createURL('/auth/sign-in', { queryParams: { link: signUpLinkMark } }) },
        });
        return { error: error?.message ?? null, confirmationRequired: !error && !data.session };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
      user: session?.user ?? null,
    };
  }, [authLinkPending, emailConfirmed, isLoading, isPasswordRecovery, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
