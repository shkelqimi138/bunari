// On This Day screen showing entries from the same date in earlier years
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useJournal } from '@/state/journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function OnThisDayScreen() {
  const router = useRouter();
  const { entries } = useJournal();
  const today = new Date();
  const memories = entries
    .filter((entry) => {
      const date = new Date(entry.createdAt);
      return (
        entry.sectionId !== 'private' &&
        date.getFullYear() < today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen scroll style={styles.screen}>
      <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="screenTitle">On This Day</AppText>
        <AppText color="dim" style={styles.subtitle}>
          Memories from {new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(today)}
        </AppText>
      </View>
      <View style={styles.timeline}>
        {memories.map((entry) => (
          <Pressable
            accessibilityRole="button"
            key={entry.id}
            onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: entry.id } })}
            style={({ pressed }) => [styles.memory, pressed && styles.pressed]}
          >
            <View style={styles.yearBadge}>
              <AppText color="accent" numeric variant="label">
                {new Date(entry.createdAt).getFullYear()}
              </AppText>
            </View>
            <View style={styles.copy}>
              <AppText variant="cardTitle">{entry.title}</AppText>
              <AppText color="dim" numberOfLines={2} style={styles.preview}>
                {entry.plainText}
              </AppText>
            </View>
            <ChevronRight color={colors.textDim} size={19} strokeWidth={1.8} />
          </Pressable>
        ))}
        {!memories.length && (
          <View style={styles.empty}>
            <Sparkles color={colors.accent} size={24} strokeWidth={1.8} />
            <AppText color="dim">Your memories will collect here over time.</AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  header: { marginTop: spacing[5] },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  timeline: { gap: spacing[3], marginTop: spacing[6] },
  memory: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 84,
    padding: spacing[4],
  },
  yearBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: 44,
    width: 48,
  },
  copy: { flex: 1, gap: spacing[1] },
  preview: { fontSize: 12, lineHeight: 17 },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[8],
  },
  pressed: { opacity: 0.72 },
});
