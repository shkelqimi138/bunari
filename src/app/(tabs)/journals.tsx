// Journals screen listing folders, protected folders, and recent entries
import { type Href, useRouter } from 'expo-router';
import { CheckCircle2, ChevronDown, ChevronRight, FolderPlus, LockKeyhole, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { SwipeableEntryRow, useEntryActions } from '@/components/entry/entry-row-actions';
import { NewFolderSheet } from '@/components/folders/new-folder-sheet';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import {
  formatEntryDate,
  notesFolderId,
  sortFolders,
  type JournalEntry,
  type JournalSectionId,
} from '@/domain/journal';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, layout, spacing } from '@/theme/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function JournalsScreen() {
  const router = useRouter();
  const { createFolder, deletedEntries, entries, expandedSectionIds, folders, toggleSectionExpanded } = useJournal();
  const privateJournal = usePrivateJournal();
  const privateStatus = privateJournal.status;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const { rowProps } = useEntryActions();
  const orderedFolders = useMemo(() => sortFolders(folders), [folders]);
  // Deleted Private entries are counted even while Private is locked; their titles stay hidden.
  const recentlyDeletedCount = deletedEntries.length + privateJournal.deletedRecordCount;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => subscription.remove();
  }, []);

  const entriesBySection = useMemo(() => {
    const grouped = new Map<JournalSectionId, JournalEntry[]>();
    for (const entry of [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
      grouped.set(entry.sectionId, [...(grouped.get(entry.sectionId) ?? []), entry]);
    }
    return grouped;
  }, [entries]);

  const createNewFolder = async (name: string, emoji: string, isProtected: boolean) => {
    if (isProtected) {
      if (privateStatus !== 'unlocked') {
        const unlocked = await privateJournal.unlockWithBiometrics();
        if (unlocked.error) return unlocked.error;
      }
      return (await privateJournal.createProtectedFolder(name, emoji)).error;
    }
    createFolder(name, emoji);
    return null;
  };

  const toggleSection = (sectionId: JournalSectionId, locked?: boolean) => {
    if (locked) {
      router.push('/private' as Href);
      return;
    }

    if (!reduceMotionEnabled) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleSectionExpanded(sectionId);
  };

  const openNewEntry = (sectionId: JournalSectionId) => {
    if (sectionId === 'private') {
      router.push('/private' as Href);
      return;
    }
    router.push({ pathname: '/entry/new', params: { sectionId } });
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="screenTitle">Journals</AppText>
        <View style={styles.headerActions}>
          <IconButton accessibilityLabel="Create a folder" icon={FolderPlus} onPress={() => setNewFolderOpen(true)} />
          <IconButton
            accessibilityLabel="Create a journal entry"
            icon={Plus}
            onPress={() => openNewEntry(notesFolderId)}
            tone="accent"
          />
        </View>
      </View>

      <View style={styles.sections}>
        {orderedFolders.map((section) => {
          const sectionEntries = entriesBySection.get(section.id) ?? [];
          const isExpanded = expandedSectionIds.includes(section.id);
          const Chevron = isExpanded ? ChevronDown : ChevronRight;

          return (
            <View key={section.id} style={styles.section}>
              <View style={styles.sectionRow}>
                <Pressable
                  accessibilityLabel={`${section.name}, ${section.locked ? 'locked' : `${sectionEntries.length} entries`}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => toggleSection(section.id, section.locked)}
                  style={({ pressed }) => [styles.sectionMain, pressed && styles.pressed]}
                >
                  <Chevron color={section.locked ? colors.textDim : colors.accent} size={19} strokeWidth={1.8} />
                  <AppText style={styles.emoji}>{section.emoji}</AppText>
                  <AppText style={styles.sectionName} variant="cardTitle">
                    {section.name}
                  </AppText>
                  {section.locked && <LockKeyhole color={colors.textDim} size={15} strokeWidth={1.8} />}
                  {section.id === 'private' ? (
                    <AppText color="dim" style={styles.count} variant="caption">
                      {privateStatus === 'unlocked' ? 'Unlocked' : 'Locked'}
                    </AppText>
                  ) : (
                    <AppText color="dim" numeric style={styles.count} variant="body">
                      {sectionEntries.length}
                    </AppText>
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Add entry to ${section.name}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => openNewEntry(section.id)}
                >
                  <Plus color={colors.textDim} size={23} strokeWidth={1.8} />
                </Pressable>
              </View>

              {isExpanded && !section.locked && (
                <View style={styles.children}>
                  {sectionEntries.slice(0, 3).map((entry) => (
                    <SwipeableEntryRow entry={entry} key={entry.id}>
                      <Pressable
                        {...rowProps(entry)}
                        accessibilityLabel={`Open entry: ${entry.title}`}
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: entry.id } })}
                        style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}
                      >
                        <View style={[styles.dot, entry.favorite && styles.favoriteDot]} />
                        <AppText numberOfLines={1} style={styles.entryTitle} variant="body">
                          {entry.title}
                        </AppText>
                        {entry.reviewed && <CheckCircle2 color={colors.accent} size={15} strokeWidth={1.8} />}
                        <AppText color="dim" numeric variant="caption">
                          {formatEntryDate(entry.createdAt)}
                        </AppText>
                      </Pressable>
                    </SwipeableEntryRow>
                  ))}
                  {sectionEntries.length === 0 && (
                    <AppText color="dim" style={styles.empty} variant="caption">
                      No entries yet
                    </AppText>
                  )}
                  <Pressable
                    accessibilityLabel={`See all ${section.name} entries`}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/journal/[sectionId]', params: { sectionId: section.id } })}
                    style={({ pressed }) => [styles.seeMore, pressed && styles.pressed]}
                  >
                    <AppText color="accent" variant="caption">
                      See more
                    </AppText>
                    <ChevronRight color={colors.accent} size={15} strokeWidth={1.8} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {/* Protected folders follow the last folder; their names are encrypted, so they show only while Private is unlocked. */}
        {privateStatus === 'unlocked' &&
          privateJournal.protectedFolders.map((folder) => (
            <View key={folder.id} style={styles.section}>
              <View style={styles.sectionRow}>
                <Pressable
                  accessibilityLabel={`${folder.name}, protected folder`}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/journal/[sectionId]',
                      params: { folderId: folder.id, sectionId: 'private' },
                    })
                  }
                  style={({ pressed }) => [styles.sectionMain, pressed && styles.pressed]}
                >
                  <ChevronRight color={colors.accent} size={19} strokeWidth={1.8} />
                  <AppText style={styles.emoji}>{folder.emoji}</AppText>
                  <AppText style={styles.sectionName} variant="cardTitle">
                    {folder.name}
                  </AppText>
                  <LockKeyhole color={colors.textDim} size={15} strokeWidth={1.8} />
                  <AppText color="dim" numeric style={styles.count} variant="body">
                    {privateJournal.entries.filter((entry) => entry.folderId === folder.id).length}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Add entry to ${folder.name}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() =>
                    router.push({ pathname: '/entry/new', params: { folderId: folder.id, sectionId: 'private' } })
                  }
                >
                  <Plus color={colors.textDim} size={23} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>
          ))}

        {recentlyDeletedCount > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Pressable
                accessibilityLabel={`Recently Deleted, ${recentlyDeletedCount} ${recentlyDeletedCount === 1 ? 'entry' : 'entries'}`}
                accessibilityRole="button"
                onPress={() => router.push('/recently-deleted' as Href)}
                style={({ pressed }) => [styles.sectionMain, pressed && styles.pressed]}
              >
                <ChevronRight color={colors.textDim} size={19} strokeWidth={1.8} />
                <View style={styles.trashIcon}>
                  <Trash2 color={colors.textDim} size={19} strokeWidth={1.8} />
                </View>
                <AppText style={styles.sectionName} variant="cardTitle">
                  Recently Deleted
                </AppText>
                <AppText color="dim" numeric style={styles.count} variant="body">
                  {recentlyDeletedCount}
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      <NewFolderSheet
        faceIdReady={Boolean(privateJournal.configuration?.biometricEnabled && privateJournal.biometricAvailable)}
        onClose={() => setNewFolderOpen(false)}
        onCreate={createNewFolder}
        onUnlockPrivate={() => router.push({ pathname: '/private', params: { returnTo: 'back' } } as Href)}
        privateStatus={privateStatus}
        visible={newFolderOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
    marginTop: spacing[4],
  },
  sections: {
    marginHorizontal: -layout.screenPadding,
  },
  section: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: layout.screenPadding,
  },
  sectionMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 60,
  },
  emoji: {
    fontSize: 21,
    lineHeight: 26,
    marginLeft: spacing[3],
    marginRight: spacing[4],
  },
  sectionName: {
    flex: 1,
  },
  // Takes the same room as a folder's emoji, so the names line up.
  trashIcon: {
    alignItems: 'center',
    marginLeft: spacing[3],
    marginRight: spacing[4],
    width: 26,
  },
  count: {
    marginLeft: spacing[2],
    marginRight: spacing[4],
  },
  children: {
    paddingLeft: 58,
    paddingRight: layout.screenPadding,
  },
  entryRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 46,
  },
  dot: {
    backgroundColor: colors.textDim,
    borderRadius: 4,
    height: 6,
    marginRight: spacing[2],
    opacity: 0.3,
    width: 6,
  },
  favoriteDot: {
    backgroundColor: colors.accent,
    opacity: 1,
  },
  entryTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  empty: {
    paddingVertical: spacing[4],
  },
  seeMore: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    justifyContent: 'flex-end',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.65,
  },
});
