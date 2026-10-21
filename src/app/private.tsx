// Private journal setup, unlock (PIN or Face ID), and recovery-key screen
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, KeyRound, LockKeyhole, ScanFace } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, fontFamilies, radii, spacing } from '@/theme/tokens';

export default function PrivateAccessScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { biometricAvailable, configuration, recover, setup, status, unlockWithBiometrics, unlockWithPin } =
    usePrivateJournal();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricPreference, setBiometricPreference] = useState<boolean | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const useBiometrics = biometricPreference ?? biometricAvailable;
  useEffect(() => {
    if (status !== 'unlocked' || recoveryKey) return;
    if (returnTo === 'change-pin' || returnTo === 'back') {
      router.back();
      return;
    }
    router.replace({ pathname: '/journal/[sectionId]', params: { sectionId: 'private' } });
  }, [recoveryKey, returnTo, router, status]);

  async function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    setLoading(true);
    const result = await action();
    setLoading(false);
    if (result.error) setError(result.error);
  }

  async function createPrivateJournal() {
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await setup(pin, useBiometrics);
    setLoading(false);
    if (result.error) setError(result.error);
    else setRecoveryKey(result.recoveryKey);
  }

  if (status === 'loading') return null;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <AppText variant="screenTitle">Private</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.hero}>
        <View style={styles.lockCircle}>
          <LockKeyhole color={colors.accent} size={30} strokeWidth={1.6} />
        </View>
        <AppText style={styles.center} variant="greeting">
          {recoveryKey
            ? 'Save your recovery key'
            : status === 'setup'
              ? 'Create your private space'
              : 'Private is locked'}
        </AppText>
        <AppText color="dim" style={styles.center}>
          {recoveryKey
            ? 'This is the only way to recover Private on a new device if your PIN and Face ID are unavailable.'
            : 'Titles, writing, locations, and private metadata stay encrypted before synchronization.'}
        </AppText>
      </View>

      {status === 'unsupported' ? (
        <View style={styles.card}>
          <AppText variant="cardTitle">Available in the iOS app</AppText>
          <AppText color="dim">
            Private uses device security and is intentionally unavailable in the Windows web preview.
          </AppText>
        </View>
      ) : recoveryKey ? (
        <View style={styles.card}>
          <AppText color="dim" variant="label">
            RECOVERY KEY
          </AppText>
          <AppText selectable style={styles.recoveryKey}>
            {recoveryKey}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/journal/[sectionId]', params: { sectionId: 'private' } })}
            style={styles.primaryButton}
          >
            <AppText color="onAccent">I saved this key</AppText>
          </Pressable>
        </View>
      ) : status === 'setup' ? (
        <View style={styles.card}>
          <PinField label="Choose PIN" onChangeText={setPin} value={pin} />
          <PinField label="Confirm PIN" onChangeText={setConfirmPin} value={confirmPin} />
          {biometricAvailable && (
            <View style={styles.optionRow}>
              <View style={styles.optionCopy}>
                <ScanFace color={colors.accent} size={21} />
                <View style={styles.optionText}>
                  <AppText variant="cardTitle">Use Face ID</AppText>
                  <AppText color="dim" variant="caption">
                    PIN remains available as fallback
                  </AppText>
                </View>
              </View>
              <Switch
                onValueChange={setBiometricPreference}
                trackColor={{ true: colors.accent }}
                value={useBiometrics}
              />
            </View>
          )}
          {error && <AppText style={styles.error}>{error}</AppText>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => void createPrivateJournal()}
            style={styles.primaryButton}
          >
            <AppText color="onAccent">{loading ? 'Creating…' : 'Create Private'}</AppText>
          </Pressable>
        </View>
      ) : recoveryMode ? (
        <View style={styles.card}>
          <TextInput
            selectionColor={colors.accent}
            autoCapitalize="characters"
            multiline
            onChangeText={setRecoveryInput}
            placeholder="Recovery key"
            placeholderTextColor={colors.textDim}
            style={[styles.input, styles.recoveryInput]}
            value={recoveryInput}
          />
          <PinField label="Choose a new PIN" onChangeText={setPin} value={pin} />
          {biometricAvailable && (
            <View style={styles.optionRow}>
              <View style={styles.optionCopy}>
                <ScanFace color={colors.accent} size={21} />
                <View style={styles.optionText}>
                  <AppText variant="cardTitle">Use Face ID</AppText>
                  <AppText color="dim" variant="caption">
                    PIN remains available as fallback
                  </AppText>
                </View>
              </View>
              <Switch
                onValueChange={setBiometricPreference}
                trackColor={{ true: colors.accent }}
                value={useBiometrics}
              />
            </View>
          )}
          {error && <AppText style={styles.error}>{error}</AppText>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => void run(() => recover(recoveryInput, pin, useBiometrics))}
            style={styles.primaryButton}
          >
            <AppText color="onAccent">{loading ? 'Recovering…' : 'Recover Private'}</AppText>
          </Pressable>
          {loading && (
            <AppText accessibilityLiveRegion="polite" color="dim" style={styles.waitNote} variant="caption">
              Opening Private… this can take a few seconds.
            </AppText>
          )}
          <Pressable accessibilityRole="button" onPress={() => setRecoveryMode(false)} style={styles.textButton}>
            <AppText color="accent">Use PIN instead</AppText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {configuration?.biometricEnabled && biometricAvailable && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
              disabled={loading}
              onPress={() => void run(unlockWithBiometrics)}
              style={styles.biometricButton}
            >
              <ScanFace color={colors.text} size={22} />
              <AppText>Unlock with Face ID</AppText>
            </Pressable>
          )}
          {configuration?.pinEnabled && <PinField label="PIN" onChangeText={setPin} value={pin} />}
          {error && <AppText style={styles.error}>{error}</AppText>}
          {configuration?.pinEnabled && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
              disabled={loading}
              onPress={() => void run(() => unlockWithPin(pin))}
              style={styles.primaryButton}
            >
              <AppText color="onAccent">{loading ? 'Unlocking…' : 'Unlock'}</AppText>
            </Pressable>
          )}
          {loading && (
            <AppText accessibilityLiveRegion="polite" color="dim" style={styles.waitNote} variant="caption">
              Opening Private… this can take a few seconds.
            </AppText>
          )}
          <Pressable accessibilityRole="button" onPress={() => setRecoveryMode(true)} style={styles.textButton}>
            <KeyRound color={colors.accent} size={16} />
            <AppText color="accent">Use recovery key</AppText>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

function PinField({
  label,
  onChangeText,
  value,
}: {
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <AppText color="dim" variant="label">
        {label}
      </AppText>
      <TextInput
        selectionColor={colors.accent}
        accessibilityLabel={label}
        autoComplete="off"
        keyboardType="number-pad"
        maxLength={12}
        onChangeText={(next) => onChangeText(next.replace(/\D/g, ''))}
        placeholder="At least 6 digits"
        placeholderTextColor={colors.textDim}
        secureTextEntry
        style={styles.input}
        textContentType="oneTimeCode"
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[7],
    marginTop: spacing[4],
  },
  headerSpacer: { width: 44 },
  hero: { alignItems: 'center', gap: spacing[3], marginBottom: spacing[7] },
  lockCircle: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 34,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  center: { maxWidth: 340, textAlign: 'center' },
  waitNote: { textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[5],
    padding: spacing[6],
  },
  field: { gap: spacing[2] },
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
  },
  recoveryInput: { minHeight: 84, paddingVertical: spacing[3], textAlignVertical: 'top' },
  optionRow: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[4],
  },
  optionCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  optionText: { gap: spacing[1] },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing[5],
  },
  biometricButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
    minHeight: 48,
  },
  textButton: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'center', minHeight: 44 },
  error: { color: '#ef8f8f', fontSize: 13 },
  recoveryKey: {
    backgroundColor: colors.background,
    borderRadius: radii.control,
    fontFamily: fontFamilies.body.semiBold,
    fontSize: 14,
    letterSpacing: 1,
    lineHeight: 23,
    padding: spacing[4],
    textAlign: 'center',
  },
});
