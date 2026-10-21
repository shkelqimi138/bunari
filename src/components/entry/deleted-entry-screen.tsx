// Read-only view of an entry in Recently Deleted, with Restore and Delete now
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeletedEntryActions } from '@/components/entry/deleted-entry-actions';
import { JournalRichEditor } from '@/components/entry/journal-rich-editor';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { formatEntryDate, type JournalEntry } from '@/domain/journal';
import { noteTextSizes } from '@/domain/note-text';
import { deletedDaysLeftLabel } from '@/domain/recently-deleted';
import { useSettings } from '@/state/settings-context';
import { colors, fontFamilies, layout, radii, spacing, typography } from '@/theme/tokens';

export function DeletedEntryScreen({ entry }: { entry: JournalEntry }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { confirmDeleteForever, restore } = useDeletedEntryActions();
  const titleSize = noteTextSizes[useSettings().noteTextSize];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <AppText color="dim" numeric variant="caption">
          In Recently Deleted · {deletedDaysLeftLabel(entry.deletedAt!)}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.top}>
        {entry.coverUri ? (
          <Image
            accessibilityIgnoresInvertColors
            contentFit="cover"
            source={{ uri: entry.coverUri }}
            style={styles.cover}
          />
        ) : null}
        <AppText color="dim" numeric variant="caption">
          {formatEntryDate(entry.createdAt)}
        </AppText>
        <AppText style={[styles.title, { fontSize: titleSize.title, lineHeight: titleSize.titleLineHeight }]}>
          {entry.title}
        </AppText>
        {entry.description ? (
          <AppText color="dim" style={styles.description}>
            {entry.description}
          </AppText>
        ) : null}
        <View style={styles.divider} />
        {entry.attachments.length > 0 && (
          <View style={styles.attachments}>
            {entry.attachments.map((attachment) => (
              <Image
                accessibilityIgnoresInvertColors
                contentFit="cover"
                key={attachment.id}
                source={{ uri: attachment.uri }}
                style={styles.attachment}
              />
            ))}
          </View>
        )}
      </ScrollView>
      {/* The note text keeps its formatting; it is shown, not edited. */}
      <JournalRichEditor
        autofocus={false}
        editable={false}
        initialDocument={entry.body}
        onToolbarStateChange={() => {}}
        style={styles.body}
      />

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void restore(entry).then((restored) => {
              if (restored) router.back();
            })
          }
          style={({ pressed }) => [styles.action, styles.restore, pressed && styles.pressed]}
        >
          <RotateCcw color={colors.accent} size={18} strokeWidth={1.8} />
          <AppText color="accent" style={styles.actionText}>
            Restore
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => confirmDeleteForever(entry, () => router.back())}
          style={({ pressed }) => [styles.action, styles.delete, pressed && styles.pressed]}
        >
          <Trash2 color={colors.danger} size={18} strokeWidth={1.8} />
          <AppText color="danger" style={styles.actionText}>
            Delete now
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[2],
  },
  // The cover, title and photos take only the room they need (at most half), the note text the rest.
  top: { flexGrow: 0, flexShrink: 1, maxHeight: '50%' },
  content: { gap: spacing[2], paddingHorizontal: layout.screenPadding },
  cover: { borderRadius: radii.card, height: 168, marginBottom: spacing[2], width: '100%' },
  title: {
    fontFamily: fontFamilies.system,
    fontSize: typography.noteTitle.fontSize,
    fontWeight: '700',
    lineHeight: typography.noteTitle.lineHeight,
  },
  description: { fontSize: 14, lineHeight: 19 },
  divider: { backgroundColor: colors.line, height: 1, marginTop: spacing[2] },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  attachment: { borderRadius: radii.control, height: 72, width: 72 },
  body: { backgroundColor: colors.background, flex: 1, paddingHorizontal: layout.screenPadding },
  actions: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[3],
  },
  action: {
    alignItems: 'center',
    borderRadius: radii.control,
    flex: 1,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 48,
  },
  restore: { backgroundColor: colors.accentSoft },
  delete: { backgroundColor: colors.dangerSoft },
  actionText: { fontFamily: fontFamilies.body.semiBold },
  pressed: { opacity: 0.7 },
});
