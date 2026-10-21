// Writing streak screen
import { useRouter } from 'expo-router';
import { ChevronLeft, Flame } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { currentStreak, streakDayKey } from '@/domain/streak';
import { useJournal } from '@/state/journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function StreakScreen() {
  const router = useRouter();
  const { entries } = useJournal();
  const now = new Date();
  const entryDates = entries.filter((entry) => entry.sectionId !== 'private').map((entry) => new Date(entry.createdAt));
  const entryDays = new Set(entryDates.map(streakDayKey));
  const streak = currentStreak(entryDates, now);
  const start = new Date(now);
  start.setDate(now.getDate() - 27);
  const days = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, logged: entryDays.has(streakDayKey(date)) };
  });

  return (
    <Screen style={styles.screen}>
      <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="screenTitle">Writing Streak</AppText>
        <AppText color="dim">Small notes become a life remembered.</AppText>
      </View>
      <View style={styles.hero}>
        <Flame color={colors.accent} size={38} strokeWidth={1.8} />
        <AppText numeric style={styles.number}>
          {streak}
        </AppText>
        <AppText color="dim">day streak</AppText>
      </View>
      <View style={styles.calendar}>
        <AppText variant="cardTitle">Last 28 days</AppText>
        <View style={styles.grid}>
          {days.map(({ date, logged }) => (
            <View key={date.toISOString()} style={styles.dayWrap}>
              <View style={[styles.day, logged && styles.loggedDay]}>
                <AppText color={logged ? 'onAccent' : 'dim'} numeric variant="caption">
                  {date.getDate()}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  header: { gap: spacing[2], marginTop: spacing[5] },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[2],
    marginTop: spacing[6],
    padding: spacing[6],
  },
  number: { color: colors.text, fontSize: 44, lineHeight: 48 },
  calendar: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[4],
    marginTop: spacing[4],
    padding: spacing[4],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayWrap: { alignItems: 'center', marginBottom: spacing[2], width: '14.285%' },
  day: { alignItems: 'center', borderRadius: radii.round, height: 30, justifyContent: 'center', width: 30 },
  loggedDay: { backgroundColor: colors.accent },
});
