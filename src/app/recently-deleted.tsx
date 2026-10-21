// Recently Deleted: deleted entries for 30 days, with Restore, Delete now and Delete all
import { type Href, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, LockKeyhole, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SwipeableDeletedRow, useDeletedEntryActions } from '@/components/entry/deleted-entry-actions';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import type { JournalEntry } from '@/domain/journal';
import { deletedDaysLeftLabel, deletedEntries, recentlyDeletedDays } from '@/domain/recently-deleted';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, fontFamilies, radii, spacing } from '@/theme/tokens';

export default function RecentlyDeletedScreen() {
  const router = useRouter();
  const journal = useJournal();
  const privateJournal = usePrivateJournal();
  const { deleteForever, rowProps } = useDeletedEntryActions();
  const privateUnlocked = privateJournal.status === 'unlocked';
  const lockedPrivateCount = privateUnlocked ? 0 : privateJournal.deletedRecordCount;
  const folderNames = useMemo(
    () => new Map(journal.folders.map((folder) => [folder.id, `${folder.emoji} ${folder.name}`])),
    [journal.folders],
  );
  const shown = useMemo(
    () => deletedEntries([...journal.deletedEntries, ...(privateUnlocked ? privateJournal.deletedEntries : [])]),
    [journal.deletedEntries, privateJournal.deletedEntries, privateUnlocked],
  );

  const folderLabel = (entry: JournalEntry) =>
    entry.sectionId === 'private' ? '🔒 Private' : (folderNames.get(entry.sectionId) ?? '📝 Notes');

  const confirmDeleteAll = () => {
    const count = shown.length;
    Alert.alert(
      `Delete ${count === 1 ? 'this entry' : `all ${count} entries`} for good?`,
      `${count === 1 ? 'It and its photos' : 'They and their photos'} will be deleted from all your devices. This cannot be undone.${lockedPrivateCount > 0 ? ' Deleted Private entries stay until you unlock Private.' : ''}`,
      [
        { style: 'cancel', text: 'Cancel' },
        { onPress: () => deleteForever(shown), style: 'destructive', text: 'Delete all' },
      ],
    );
  };

  return (
    <Screen scroll style={styles.screen}>
      <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="screenTitle">Recently Deleted</AppText>
        <AppText color="dim" style={styles.subtitle}>
          Deleted entries stay here for {recentlyDeletedDays} days, then they and their photos are deleted for good.
        </AppText>
      </View>

      {shown.length > 0 && (
        <View style={styles.list}>
          {shown.map((entry) => (
            <SwipeableDeletedRow entry={entry} key={entry.id}>
              <Pressable
                {...rowProps(entry)}
                accessibilityLabel={`${entry.title}, ${folderLabel(entry)}, ${deletedDaysLeftLabel(entry.deletedAt!)}`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: entry.id } })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowText}>
                  <AppText numberOfLines={1} style={styles.rowTitle}>
                    {entry.title}
                  </AppText>
                  <AppText color="dim" numberOfLines={1} variant="caption">
                    {folderLabel(entry)}
                  </AppText>
                </View>
                <AppText color="dim" numeric variant="caption">
                  {deletedDaysLeftLabel(entry.deletedAt!)}
                </AppText>
              </Pressable>
            </SwipeableDeletedRow>
          ))}
        </View>
      )}

      {lockedPrivateCount > 0 && (
        <Pressable
          accessibilityLabel={`${lockedPrivateCount} deleted Private ${lockedPrivateCount === 1 ? 'entry' : 'entries'}. Unlock Private to see ${lockedPrivateCount === 1 ? 'it' : 'them'}.`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/private', params: { returnTo: 'back' } } as Href)}
          style={({ pressed }) => [styles.lockedRow, pressed && styles.pressed]}
        >
          <LockKeyhole color={colors.textDim} size={18} strokeWidth={1.8} />
          <View style={styles.rowText}>
            <AppText style={styles.rowTitle}>
              {lockedPrivateCount} deleted Private {lockedPrivateCount === 1 ? 'entry' : 'entries'}
            </AppText>
            <AppText color="dim" variant="caption">
              Unlock Private to see {lockedPrivateCount === 1 ? 'it' : 'them'}
            </AppText>
          </View>
          <ChevronRight color={colors.textDim} size={18} strokeWidth={1.8} />
        </Pressable>
      )}

      {shown.length === 0 && lockedPrivateCount === 0 && (
        <View style={styles.empty}>
          <Trash2 color={colors.accent} size={28} strokeWidth={1.7} />
          <AppText variant="cardTitle">Nothing here</AppText>
          <AppText color="dim" style={styles.emptyCopy}>
            Entries you delete stay here for {recentlyDeletedDays} days, so you can restore them.
          </AppText>
        </View>
      )}

      {shown.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={confirmDeleteAll}
          style={({ pressed }) => [styles.deleteAll, pressed && styles.pressed]}
        >
          <Trash2 color={colors.danger} size={18} strokeWidth={1.8} />
          <AppText color="danger" style={styles.deleteAllText}>
            Delete all
          </AppText>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  header: { marginTop: spacing[5] },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: spacing[6],
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 58,
    paddingHorizontal: spacing[4],
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20 },
  lockedRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    minHeight: 58,
    paddingHorizontal: spacing[4],
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[3],
    marginTop: spacing[6],
    padding: spacing[8],
  },
  emptyCopy: { textAlign: 'center' },
  deleteAll: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    marginTop: spacing[6],
    minHeight: 44,
    paddingHorizontal: spacing[4],
  },
  deleteAllText: { fontFamily: fontFamilies.body.semiBold },
  pressed: { opacity: 0.65 },
});
