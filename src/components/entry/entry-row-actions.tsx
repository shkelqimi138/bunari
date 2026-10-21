// Swipe-to-delete row and long-press actions (favorite, delete) for entry lists
import { Trash2 } from 'lucide-react-native';
import { type PropsWithChildren, useCallback, useRef } from 'react';
import {
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
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

// Delete and favorite actions for entry rows in lists, for regular and Private entries.
export function useEntryActions() {
  const journal = useJournal();
  const privateJournal = usePrivateJournal();

  const remove = useCallback(
    (entry: JournalEntry) => {
      if (entry.sectionId === 'private') void privateJournal.deleteEntry(entry.id);
      else journal.deleteEntry(entry.id);
    },
    [journal, privateJournal],
  );

  const toggleFavorite = useCallback(
    (entry: JournalEntry) => {
      if (entry.sectionId === 'private') void privateJournal.toggleFavorite(entry.id);
      else journal.toggleFavorite(entry.id);
    },
    [journal, privateJournal],
  );

  const toggleTodoItem = useCallback(
    (entry: JournalEntry, todoItemId: string) => {
      if (entry.sectionId === 'private') void privateJournal.toggleTodoItem(entry.id, todoItemId);
      else journal.toggleTodoItem(entry.id, todoItemId);
    },
    [journal, privateJournal],
  );

  const confirmDelete = useCallback(
    (entry: JournalEntry, onCancel?: () => void) => {
      Alert.alert(
        'Delete entry?',
        `“${entry.title}” moves to Recently Deleted, where you can restore it for 30 days.`,
        [
          { onPress: onCancel, style: 'cancel', text: 'Cancel' },
          { onPress: () => remove(entry), style: 'destructive', text: 'Delete' },
        ],
      );
    },
    [remove],
  );

  const showMenu = useCallback(
    (entry: JournalEntry) => {
      const favoriteLabel = entry.favorite ? 'Remove from favorites' : 'Add to favorites';
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            cancelButtonIndex: 2,
            destructiveButtonIndex: 1,
            options: [favoriteLabel, 'Delete entry', 'Cancel'],
            title: entry.title,
          },
          (index) => {
            if (index === 0) toggleFavorite(entry);
            if (index === 1) confirmDelete(entry);
          },
        );
        return;
      }
      Alert.alert(entry.title, undefined, [
        { onPress: () => toggleFavorite(entry), text: favoriteLabel },
        { onPress: () => confirmDelete(entry), style: 'destructive', text: 'Delete entry' },
        { style: 'cancel', text: 'Cancel' },
      ]);
    },
    [confirmDelete, toggleFavorite],
  );

  // Long-press opens the menu; VoiceOver users get the same actions in the rotor.
  const rowProps = useCallback(
    (entry: JournalEntry) => ({
      accessibilityActions: [
        { label: 'Delete entry', name: 'delete' },
        { label: 'More options', name: 'longpress' },
      ],
      accessibilityHint: 'Swipe left to delete, or press and hold for more options.',
      delayLongPress: 350,
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'delete') confirmDelete(entry);
        if (event.nativeEvent.actionName === 'longpress') showMenu(entry);
      },
      onLongPress: () => showMenu(entry),
    }),
    [confirmDelete, showMenu],
  );

  return { confirmDelete, rowProps, showMenu, toggleFavorite, toggleTodoItem };
}

// Swipe an entry left to reveal Delete, like iOS Mail and Notes.
export function SwipeableEntryRow({ children, entry }: PropsWithChildren<{ entry: JournalEntry }>) {
  const swipeable = useRef<SwipeableMethods>(null);
  const { confirmDelete } = useEntryActions();

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      ref={swipeable}
      containerStyle={styles.container}
      renderRightActions={() => (
        <View style={styles.actionSlot}>
          <Pressable
            accessibilityLabel={`Delete ${entry.title}`}
            accessibilityRole="button"
            onPress={() => confirmDelete(entry, () => swipeable.current?.close())}
            style={({ pressed }) => [styles.deleteAction, pressed && styles.deletePressed]}
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
  // A gap keeps the row's date clear of the button.
  actionSlot: { paddingLeft: spacing[3], paddingVertical: spacing[1], width: 96 },
  deleteAction: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.control,
    flex: 1,
    gap: spacing[1],
    justifyContent: 'center',
  },
  deletePressed: { opacity: 0.7 },
});
