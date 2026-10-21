// Account sheets for changing the email and the password (accounts that sign in with email)
import { X } from 'lucide-react-native';
import { type PropsWithChildren, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { newEmailProblem, newPasswordProblem } from '@/lib/auth/account-change';
import { passwordRuleHint } from '@/lib/auth/password-rule';
import { colors, fontFamilies, radii, spacing } from '@/theme/tokens';

type Result = { error: string | null };

function Sheet({
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{ onClose: () => void; title: string; visible: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable accessible={false} onPress={onClose} style={styles.backdrop}>
          <Pressable
            accessible={false}
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing[5] }]}
          >
            <View style={styles.header}>
              <AppText accessibilityRole="header" variant="cardTitle">
                {title}
              </AppText>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={12} onPress={onClose}>
                <X color={colors.textDim} size={20} />
              </Pressable>
            </View>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field(props: TextInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={colors.textDim}
      selectionColor={colors.accent}
      style={styles.input}
      {...props}
    />
  );
}

function SubmitButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
    >
      <AppText color="onAccent" variant="cardTitle">
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChangePasswordSheet({
  onClose,
  onDone,
  onSubmit,
  visible,
}: {
  onClose: () => void;
  onDone: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<Result>;
  visible: boolean;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    onClose();
  };
  // Stays open while the change is being made, so its answer is never shown to a closed sheet.
  const close = () => {
    if (!busy) reset();
  };

  const submit = async () => {
    const problem = newPasswordProblem(current, next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const result = await onSubmit(current, next);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    reset();
    onDone();
  };

  return (
    <Sheet onClose={close} title="Change password" visible={visible}>
      <Field
        accessibilityLabel="Current password"
        autoComplete="current-password"
        onChangeText={setCurrent}
        placeholder="Current password"
        secureTextEntry
        textContentType="password"
        value={current}
      />
      <Field
        accessibilityLabel="New password"
        autoComplete="new-password"
        onChangeText={setNext}
        placeholder="New password"
        secureTextEntry
        textContentType="newPassword"
        value={next}
      />
      <Field
        accessibilityLabel="Confirm new password"
        autoComplete="new-password"
        onChangeText={setConfirm}
        placeholder="Confirm new password"
        secureTextEntry
        textContentType="newPassword"
        value={confirm}
      />
      <AppText color="dim" variant="caption">
        {passwordRuleHint}. Your notes and Private journal are not affected.
      </AppText>
      {error ? (
        <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
          {error}
        </AppText>
      ) : null}
      <SubmitButton busy={busy} label={busy ? 'Changing…' : 'Change password'} onPress={() => void submit()} />
    </Sheet>
  );
}

export function ChangeEmailSheet({
  currentEmail,
  onClose,
  onSubmit,
  visible,
}: {
  currentEmail: string | null;
  onClose: () => void;
  onSubmit: (newEmail: string, currentPassword: string) => Promise<Result>;
  visible: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setEmail('');
    setPassword('');
    setError(null);
    setSentTo(null);
    onClose();
  };

  const submit = async () => {
    const problem = newEmailProblem(email, currentEmail) ?? (password ? null : 'Enter your current password.');
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const result = await onSubmit(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setPassword('');
    setSentTo(email.trim());
  };

  return (
    <Sheet onClose={close} title="Change email" visible={visible}>
      {sentTo ? (
        <>
          <AppText accessibilityLiveRegion="polite">Check your email</AppText>
          <AppText color="dim" variant="caption">
            We sent a confirmation link to {sentTo}
            {currentEmail ? `, and one to ${currentEmail} if both addresses need to confirm` : ''}. Open each link you
            receive on this iPhone; your email changes once that is done. Until then you keep signing in with{' '}
            {currentEmail ?? 'your current email'}.
          </AppText>
          <SubmitButton busy={false} label="Done" onPress={close} />
        </>
      ) : (
        <>
          <AppText color="dim" variant="caption">
            Current email: {currentEmail ?? 'none'}
          </AppText>
          <Field
            accessibilityLabel="New email"
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="New email"
            textContentType="emailAddress"
            value={email}
          />
          <Field
            accessibilityLabel="Current password"
            autoComplete="current-password"
            onChangeText={setPassword}
            placeholder="Current password"
            secureTextEntry
            textContentType="password"
            value={password}
          />
          {error ? (
            <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
              {error}
            </AppText>
          ) : null}
          <SubmitButton
            busy={busy}
            label={busy ? 'Sending…' : 'Send confirmation link'}
            onPress={() => void submit()}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[1] },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: spacing[1],
    minHeight: 48,
  },
  buttonPressed: { opacity: 0.8 },
});
