// Shared layout, field, button, message, and consent components for the auth screens
import * as WebBrowser from 'expo-web-browser';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { websiteLinks } from '@/config/website';
import { accountConsentText } from '@/domain/consent';
import { colors, fontFamilies, layout, radii, spacing } from '@/theme/tokens';

export function AuthShell({
  children,
  footer,
  subtitle,
  title,
}: PropsWithChildren<{
  footer?: ReactNode;
  subtitle: string;
  title: string;
}>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            <AppText color="accent" variant="label">
              BUNARI
            </AppText>
            <AppText style={styles.title} variant="greeting">
              {title}
            </AppText>
            <AppText color="dim" style={styles.subtitle}>
              {subtitle}
            </AppText>
          </View>
          <View style={styles.card}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Under the sign-in buttons: what creating an account means, with the terms and privacy policy one tap away.
export function AuthConsentNote() {
  const open = (url: string) => {
    void WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.accent,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    }).catch(() => undefined);
  };
  return (
    <View style={styles.consent}>
      <AppText color="dim" variant="caption">
        {accountConsentText}
      </AppText>
      <View style={styles.consentLinks}>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => open(websiteLinks.terms)}>
          <AppText color="accent" variant="caption">
            Terms of use
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => open(websiteLinks.privacy)}>
          <AppText color="accent" variant="caption">
            Privacy policy
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// `hint` is a short rule shown under the field, such as the password rule. VoiceOver reads it as the
// text after the field, not as a hint, because people can turn VoiceOver hints off (code review,
// 2026-10-08).
export function AuthField({ hint, label, ...props }: TextInputProps & { hint?: string; label: string }) {
  return (
    <View style={styles.fieldGroup}>
      <AppText color="dim" variant="label">
        {label}
      </AppText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accent}
        style={styles.input}
      />
      {hint ? (
        <AppText color="dim" variant="caption">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function AuthButton({
  children,
  disabled,
  loading,
  onPress,
}: PropsWithChildren<{
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <AppText color="onAccent" style={styles.buttonText}>
          {children}
        </AppText>
      )}
    </Pressable>
  );
}

export function AuthMessage({
  children,
  tone = 'error',
}: PropsWithChildren<{
  tone?: 'error' | 'success';
}>) {
  return (
    <View style={[styles.message, tone === 'success' && styles.successMessage]}>
      <AppText style={styles.messageText}>{children}</AppText>
    </View>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <AppText color="dim" style={styles.dividerText}>
        OR USE EMAIL
      </AppText>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[8],
  },
  heading: { gap: spacing[2], marginBottom: spacing[7] },
  title: { marginTop: spacing[1] },
  subtitle: { lineHeight: 20, maxWidth: 330 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[5],
    padding: spacing[6],
  },
  footer: { alignItems: 'center', marginTop: spacing[6] },
  consent: { gap: spacing[2] },
  consentLinks: { flexDirection: 'row', gap: spacing[5] },
  fieldGroup: { gap: spacing[2] },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  dividerLine: { backgroundColor: colors.line, flex: 1, height: 1 },
  dividerText: { fontSize: 10, letterSpacing: 1.2 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing[5],
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontFamily: fontFamilies.body.bold },
  message: {
    backgroundColor: 'rgba(196, 77, 77, 0.13)',
    borderColor: 'rgba(196, 77, 77, 0.35)',
    borderRadius: radii.small,
    borderWidth: 1,
    padding: spacing[3],
  },
  successMessage: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(217,154,82,0.35)',
  },
  messageText: { fontSize: 13, lineHeight: 18 },
});
