// Route that opens an existing entry in the entry editor, or read-only when it is in Recently Deleted
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { DeletedEntryScreen } from '@/components/entry/deleted-entry-screen';
import { EntryEditorScreen } from '@/components/entry/entry-editor-screen';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import type { JournalEntry } from '@/domain/journal';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function EntryScreen() {
  const router = useRouter();
  const { entryId, saved } = useLocalSearchParams<{ entryId: string; saved?: string }>();
  const { getEntry } = useJournal();
  const privateJournal = usePrivateJournal();
  const entry = getEntry(entryId) ?? privateJournal.getEntry(entryId);
  // Whether the screen shows a deleted entry is decided once, as soon as the entry is found: it then
  // stays read-only while it closes after Restore or Delete now, and an entry deleted from its own
  // editor keeps the editor while it closes instead of briefly loading the read-only view.
  // undefined = not decided yet (the entry is still loading).
  const [deletedSnapshot, setDeletedSnapshot] = useState<JournalEntry | null | undefined>(() =>
    entry ? (entry.deletedAt ? entry : null) : undefined,
  );
  if (deletedSnapshot === undefined && entry) setDeletedSnapshot(entry.deletedAt ? entry : null);

  // A deleted Private entry is hidden again as soon as Private locks.
  const privateLocked = deletedSnapshot?.sectionId === 'private' && privateJournal.status !== 'unlocked';
  if (privateLocked) {
    return (
      <Screen style={styles.center}>
        <LockKeyhole color={colors.textDim} size={28} strokeWidth={1.7} />
        <AppText variant="cardTitle">Private is locked</AppText>
        <AppText color="dim" style={styles.copy}>
          Unlock Private to see this entry.
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/private', params: { returnTo: 'back' } } as Href)}
          style={({ pressed }) => [styles.unlock, pressed && styles.pressed]}
        >
          <AppText color="accent">Unlock Private</AppText>
        </Pressable>
      </Screen>
    );
  }
  if (deletedSnapshot) return <DeletedEntryScreen entry={entry?.deletedAt ? entry : deletedSnapshot} />;

  if (!entry) {
    return (
      <Screen style={styles.center}>
        <AppText variant="cardTitle">Entry not found</AppText>
      </Screen>
    );
  }

  return <EntryEditorScreen entry={entry} openSaved={saved === '1'} />;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing[3], justifyContent: 'center' },
  copy: { textAlign: 'center' },
  unlock: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[5],
  },
  pressed: { opacity: 0.7 },
});
