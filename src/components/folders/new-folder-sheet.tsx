// Bottom sheet for creating a folder, optionally protected by the Private lock
import { LockKeyhole, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { colors, fontFamilies, layout, radii, spacing } from '@/theme/tokens';

type NewFolderSheetProps = {
  faceIdReady: boolean;
  onClose: () => void;
  onCreate: (name: string, emoji: string, isProtected: boolean) => Promise<string | null>;
  onUnlockPrivate: () => void;
  privateStatus: 'loading' | 'setup' | 'locked' | 'unlocked' | 'unsupported';
  visible: boolean;
};

export function NewFolderSheet({
  faceIdReady,
  onClose,
  onCreate,
  onUnlockPrivate,
  privateStatus,
  visible,
}: NewFolderSheetProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [isProtected, setIsProtected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const privateReady = privateStatus === 'unlocked';
  // Locked Private can still be used when Face ID can unlock it while creating.
  const unlockWithFaceId = !privateReady && faceIdReady;
  const blocked = saving || (isProtected && !privateReady && !unlockWithFaceId);
  const protectionAvailable = privateStatus === 'locked' || privateStatus === 'unlocked';

  const close = () => {
    setName('');
    setEmoji('📁');
    setIsProtected(false);
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Give the folder a name.');
      return;
    }
    setSaving(true);
    const result = await onCreate(name.trim(), emoji.trim(), isProtected);
    setSaving(false);
    if (result) setError(result);
    else close();
  };

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Pressable accessible={false} onPress={close} style={styles.backdrop}>
          <Pressable
            accessible={false}
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={styles.sheet}
          >
            <View style={styles.sheetHeader}>
              <AppText accessibilityRole="header" variant="cardTitle">
                New folder
              </AppText>
              <IconButton accessibilityLabel="Close new folder form" icon={X} onPress={close} />
            </View>
            <AppText color="dim" variant="label">
              Name
            </AppText>
            <View style={styles.nameRow}>
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Folder emoji"
                maxLength={4}
                onChangeText={setEmoji}
                style={[styles.input, styles.emojiInput]}
                value={emoji}
              />
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Folder name"
                autoFocus
                maxLength={80}
                onChangeText={(value) => {
                  setName(value);
                  setError(null);
                }}
                onSubmitEditing={() => void save()}
                placeholder="For example Work"
                placeholderTextColor={colors.textDim}
                returnKeyType="done"
                style={[styles.input, styles.nameInput]}
                value={name}
              />
            </View>
            {protectionAvailable && (
              <View style={styles.optionRow}>
                <View style={styles.optionCopy}>
                  <LockKeyhole color={colors.accent} size={20} strokeWidth={1.8} />
                  <View style={styles.optionText}>
                    <AppText variant="cardTitle">Protect with Private lock</AppText>
                    <AppText color="dim" variant="caption">
                      Encrypted inside Private and opened with your Private PIN or Face ID.
                    </AppText>
                  </View>
                </View>
                <Switch
                  accessibilityLabel="Protect with Private lock"
                  onValueChange={(value) => {
                    setIsProtected(value);
                    setError(null);
                  }}
                  trackColor={{ true: colors.accent }}
                  value={isProtected}
                />
              </View>
            )}
            {isProtected && !privateReady && !unlockWithFaceId && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  close();
                  onUnlockPrivate();
                }}
                style={styles.textButton}
              >
                <AppText color="accent" variant="caption">
                  Unlock Private first, then create the folder
                </AppText>
              </Pressable>
            )}
            {error && (
              <AppText accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </AppText>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked }}
              disabled={blocked}
              onPress={() => void save()}
              style={[styles.saveButton, blocked && styles.disabled]}
            >
              <AppText color="onAccent" variant="cardTitle">
                {saving
                  ? 'Creating…'
                  : isProtected && unlockWithFaceId
                    ? 'Unlock with Face ID and create'
                    : 'Create folder'}
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.68)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    gap: spacing[3],
    paddingBottom: spacing[8],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[3],
  },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', gap: spacing[2] },
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
  emojiInput: { fontSize: 20, textAlign: 'center', width: 54 },
  nameInput: { flex: 1 },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  optionCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[3] },
  optionText: { flex: 1, gap: 2 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  error: { color: colors.danger },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing[2],
    minHeight: 46,
  },
  disabled: { opacity: 0.5 },
});
