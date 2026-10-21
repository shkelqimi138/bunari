// Restore and delete-forever actions for entries in Recently Deleted, with a swipeable row
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { type PropsWithChildren, useCallback, useRef } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  Alert,
  type AccessibilityActionEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppText } from '@/components/ui/app-text';
import type { JournalEntry } from '@/domain/journal';
import { isExpired } from '@/domain/recently-deleted';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

export function useDeletedEntryActions() {
  const journal = useJournal();
  const privateJournal = usePrivateJournal();

  // Resolves true only when the entry was really restored.
  const restore = useCallback(
    async (entry: JournalEntry) => {
      if (isExpired(entry.deletedAt)) {
        Alert.alert(
          'Too late to restore',
          'This entry was in Recently Deleted for 30 days and is being deleted for good.',
        );
        return false;
      }
      if (entry.sectionId === 'private' && privateJournal.status !== 'unlocked') {
        Alert.alert('Unlock Private first', 'Private locked itself. Unlock it to restore this entry.');
        return false;
      }
      const restored =
        entry.sectionId === 'private' ? await privateJournal.restoreEntry(entry.id) : journal.restoreEntry(entry.id);
      if (restored) AccessibilityInfo.announceForAccessibility(`${entry.title} restored`);
      else Alert.alert('Could not restore', 'This entry is no longer in Recently Deleted.');
      return restored;
    },
    [journal, privateJournal],
  );

  const deleteForever = useCallback(
    (entries: JournalEntry[]) => {
      const regular = entries.filter((entry) => entry.sectionId !== 'private').map((entry) => entry.id);
      const protectedIds = entries.filter((entry) => entry.sectionId === 'private').map((entry) => entry.id);
      if (regular.length > 0) journal.deleteEntriesForever(regular);
      if (protectedIds.length > 0) privateJournal.deleteEntriesForever(protectedIds);
    },
    [journal, privateJournal],
  );

  const confirmDeleteForever = useCallback(
    (entry: JournalEntry, onDone?: () => void, onCancel?: () => void) => {
      Alert.alert(
        'Delete for good?',
        `“${entry.title}” and its photos will be deleted from all your devices. This cannot be undone.`,
        [
          { onPress: onCancel, style: 'cancel', text: 'Cancel' },
          {
            onPress: () => {
              onDone?.();
              deleteForever([entry]);
            },
            style: 'destructive',
            text: 'Delete',
          },
        ],
      );
    },
    [deleteForever],
  );

  const showMenu = useCallback(
    (entry: JournalEntry) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            cancelButtonIndex: 2,
            destructiveButtonIndex: 1,
            options: ['Restore', 'Delete now', 'Cancel'],
            title: entry.title,
          },
          (index) => {
            if (index === 0) void restore(entry);
            if (index === 1) confirmDeleteForever(entry);
          },
        );
        return;
      }
      Alert.alert(entry.title, undefined, [
        { onPress: () => void restore(entry), text: 'Restore' },
        { onPress: () => confirmDeleteForever(entry), style: 'destructive', text: 'Delete now' },
        { style: 'cancel', text: 'Cancel' },
      ]);
    },
    [confirmDeleteForever, restore],
  );

  // Long-press opens the menu; VoiceOver users get the same actions in the rotor.
  const rowProps = useCallback(
    (entry: JournalEntry) => ({
      accessibilityActions: [
        { label: 'Restore', name: 'restore' },
        { label: 'Delete now', name: 'delete' },
      ],
      accessibilityHint: 'Swipe left to restore or delete, or press and hold for options.',
      delayLongPress: 350,
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'restore') void restore(entry);
        if (event.nativeEvent.actionName === 'delete') confirmDeleteForever(entry);
      },
      onLongPress: () => showMenu(entry),
    }),
    [confirmDeleteForever, restore, showMenu],
  );

  return { confirmDeleteForever, deleteForever, restore, rowProps };
}

// Swipe a deleted entry left to reveal Restore and Delete.
export function SwipeableDeletedRow({ children, entry }: PropsWithChildren<{ entry: JournalEntry }>) {
  const swipeable = useRef<SwipeableMethods>(null);
  const { confirmDeleteForever, restore } = useDeletedEntryActions();
  const close = () => swipeable.current?.close();

  return (
    <ReanimatedSwipeable
      containerStyle={styles.container}
      friction={2}
      overshootRight={false}
      ref={swipeable}
      renderRightActions={() => (
        <View style={styles.actionSlot}>
          <Pressable
            accessibilityLabel={`Restore ${entry.title}`}
            accessibilityRole="button"
            onPress={() => {
              close();
              void restore(entry);
            }}
            style={({ pressed }) => [styles.action, styles.restoreAction, pressed && styles.pressed]}
          >
            <RotateCcw color={colors.accent} size={18} strokeWidth={1.9} />
            <AppText color="accent" variant="caption">
              Restore
            </AppText>
          </Pressable>
          <Pressable
            accessibilityLabel={`Delete ${entry.title} now`}
            accessibilityRole="button"
            onPress={() => confirmDeleteForever(entry, undefined, close)}
            style={({ pressed }) => [styles.action, styles.deleteAction, pressed && styles.pressed]}
          >
            <Trash2 color={colors.danger} size={18} strokeWidth={1.9} />
            <AppText color="danger" variant="caption">
              Delete
            </AppText>
          </Pressable>
        </View>
      )}
      rightThreshold={40}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  // The row is clipped so a long title never spills past its edges while swiped.
  container: { overflow: 'hidden' },
  actionSlot: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingLeft: spacing[3],
    paddingVertical: spacing[1],
    width: 184,
  },
  action: { alignItems: 'center', borderRadius: radii.control, flex: 1, gap: spacing[1], justifyContent: 'center' },
  restoreAction: { backgroundColor: colors.accentSoft },
  deleteAction: { backgroundColor: colors.dangerSoft },
  pressed: { opacity: 0.7 },
});
