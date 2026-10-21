// Today screen: daily prompt, recent entries, and quick actions
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Bell,
  Brain,
  CalendarDays,
  ChevronRight,
  Flame,
  LayoutTemplate,
  Lightbulb,
  Sparkles,
  UserRound,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { onThisDayYear } from '@/domain/journal';
import { nextGreetingChange, profileInitial, todayGreeting } from '@/domain/profile';
import { currentStreak, streakDayKey, wroteOn } from '@/domain/streak';
import { useDailyPrompt } from '@/hooks/use-daily-prompt';
import { useAuth } from '@/state/auth-context';
import { useJournal } from '@/state/journal-context';
import { useSettings } from '@/state/settings-context';
import { colors, fontFamilies, radii, spacing } from '@/theme/tokens';

export default function TodayScreen() {
  const router = useRouter();
  const { entries } = useJournal();
  const { user } = useAuth();
  const settings = useSettings();
  const { avatarUrl, displayName } = settings;
  // The reminder is on by default; notification permission is asked only after this explains it.
  const offerReminder =
    settings.reminderAvailable &&
    settings.reminderEnabled &&
    settings.reminderPermission === 'undetermined' &&
    !settings.reminderPromptDismissed;
  const initial = profileInitial(displayName, user?.email);
  const dailyPrompt = useDailyPrompt();
  // The time behind the greeting and the date: refreshed when Today is shown again, when the app
  // comes back, and at noon, six, and midnight while it stays open.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, []),
  );
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), nextGreetingChange(now).getTime() - now.getTime());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [now]);
  const historicalEntries = useMemo(
    () =>
      entries
        .filter((entry) => {
          const date = new Date(entry.createdAt);
          return (
            entry.sectionId !== 'private' &&
            date.getFullYear() < now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate()
          );
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries, now],
  );
  const years = historicalEntries.map((entry) => new Date(entry.createdAt).getFullYear());
  const [pickedYear, setPickedYear] = useState(years[0]);
  const selectedYear = onThisDayYear(years, pickedYear);
  const selectedEntry =
    historicalEntries.find((entry) => new Date(entry.createdAt).getFullYear() === selectedYear) ?? historicalEntries[0];
  const entryDates = entries.filter((entry) => entry.sectionId !== 'private').map((entry) => new Date(entry.createdAt));
  const streak = currentStreak(entryDates, now);
  const wroteToday = wroteOn(entryDates, now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return { date, logged: entryDates.some((entryDate) => streakDayKey(entryDate) === streakDayKey(date)) };
  });
  const greeting = todayGreeting(now.getHours(), displayName);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(now);

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText color="accent" numeric variant="label">
            {dateLabel}
          </AppText>
          {/* One line on every iPhone: a long name shrinks the greeting slightly (see greetingNameMaxLetters). */}
          <AppText
            accessibilityLabel={todayGreeting(now.getHours(), displayName, Infinity)}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            style={styles.greeting}
            variant="greeting"
          >
            {greeting}
          </AppText>
        </View>
        <Pressable
          accessibilityLabel="Open account"
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/more')}
          style={styles.avatar}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : initial ? (
            <AppText color="accent" style={styles.avatarText}>
              {initial}
            </AppText>
          ) : (
            <UserRound color={colors.accent} size={22} />
          )}
        </Pressable>
      </View>

      {offerReminder && (
        <View style={styles.reminderCard}>
          <View style={styles.reminderHeading}>
            <Bell color={colors.accent} size={18} strokeWidth={1.8} />
            <AppText variant="cardTitle">A daily reminder at {settings.reminderTime}</AppText>
          </View>
          <AppText color="dim" variant="caption">
            A gentle nudge to write, once a day. It never shows your notes, and you can change the time in Account.
          </AppText>
          <View style={styles.reminderActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void settings.allowReminderNotifications()}
              style={({ pressed }) => [styles.reminderAllow, pressed && styles.pressed]}
            >
              <AppText color="onAccent" variant="caption">
                Turn on
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={settings.dismissReminderPrompt}
              style={({ pressed }) => [styles.reminderLater, pressed && styles.pressed]}
            >
              <AppText color="dim" variant="caption">
                Not now
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      <SectionHeader title="Quick Start" onSeeMore={() => router.push('/templates')} />
      <View style={styles.quickGrid}>
        <QuickAction icon={Lightbulb} label="Suggestions" onPress={() => router.push('/(tabs)/prompts')} />
        <QuickAction icon={CalendarDays} label="Day View" onPress={() => router.push('/journal/home')} />
        <QuickAction icon={LayoutTemplate} label="Templates" onPress={() => router.push('/templates')} />
      </View>

      <SectionHeader title="On This Day" onSeeMore={() => router.push('/on-this-day')} />
      {years.length > 0 && (
        <ScrollView contentContainerStyle={styles.yearTabs} horizontal showsHorizontalScrollIndicator={false}>
          {years.map((year) => (
            <Pressable
              accessibilityRole="tab"
              key={year}
              onPress={() => setPickedYear(year)}
              style={[styles.yearPill, year === selectedYear && styles.yearPillActive]}
            >
              <AppText color={year === selectedYear ? 'accent' : 'dim'} numeric variant="caption">
                {year}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {selectedEntry ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: selectedEntry.id } })}
          style={styles.memoryCard}
        >
          <View style={styles.memoryThumbnail}>
            <Sparkles color={colors.accent} size={22} strokeWidth={1.7} />
          </View>
          <View style={styles.memoryCopy}>
            <AppText color="accent" numeric variant="label">
              {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
                new Date(selectedEntry.createdAt),
              )}
            </AppText>
            <AppText numberOfLines={2} style={styles.memoryText}>
              {selectedEntry.plainText}
            </AppText>
          </View>
          <ChevronRight color={colors.textDim} size={20} strokeWidth={1.8} />
        </Pressable>
      ) : (
        <View style={styles.emptyMemory}>
          <AppText color="dim" variant="caption">
            Past entries from today will appear here.
          </AppText>
        </View>
      )}

      <SectionHeader title="Daily Prompt" onSeeMore={() => router.push('/(tabs)/prompts')} />
      <Pressable
        accessibilityLabel="Open daily prompt"
        accessibilityRole="button"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/daily-prompt');
        }}
        style={({ pressed }) => [styles.promptCard, pressed && styles.pressed]}
      >
        <View style={styles.promptKicker}>
          <Sparkles color={colors.accent} size={18} strokeWidth={1.8} />
          <AppText color="accent" variant="label">
            {dailyPrompt.source === 'ai' ? 'Daily prompt · by AI' : 'Daily prompt'}
          </AppText>
        </View>
        <AppText style={styles.promptQuestion} variant="prompt">
          {dailyPrompt.prompt}
        </AppText>
        <View style={styles.promptFooter}>
          <View style={styles.reflectPill}>
            <AppText color="accent" variant="cardTitle">
              Reflect
            </AppText>
          </View>
          <AppText color="dim" numeric variant="caption">
            ≈ {dailyPrompt.minutes} min
          </AppText>
        </View>
      </Pressable>

      <SectionHeader title="Weekly Insight" onSeeMore={() => router.push('/weekly-summary')} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/weekly-summary')} style={styles.insightCard}>
        <View style={styles.insightIcon}>
          <Brain color={colors.accent} size={24} strokeWidth={1.7} />
        </View>
        <View style={styles.insightCopy}>
          <AppText variant="cardTitle">See patterns from this week</AppText>
          <AppText color="dim" variant="caption">
            AI looks for patterns in your regular entries
          </AppText>
        </View>
        <ChevronRight color={colors.textDim} size={20} />
      </Pressable>

      <SectionHeader title="Streak" onSeeMore={() => router.push('/streak')} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/streak')} style={styles.streakCard}>
        <View style={styles.streakMain}>
          <Flame color={colors.accent} size={30} strokeWidth={1.8} />
          <AppText numeric variant="streak">
            {streak}
          </AppText>
        </View>
        <View style={styles.streakDetails}>
          <AppText color="dim" variant="caption">
            {streak > 0 && !wroteToday ? 'day streak · write today to keep it' : 'day streak · keep it lit'}
          </AppText>
          <View style={styles.weekRow}>
            {weekDays.map(({ date, logged }) => (
              <View key={date.toISOString()} style={styles.weekDay}>
                <View style={[styles.dayBar, logged && styles.dayBarLogged]} />
                <AppText
                  color={date.toDateString() === now.toDateString() ? 'accent' : 'dim'}
                  numeric
                  variant="caption"
                >
                  {'MTWTFSS'[(date.getDay() + 6) % 7]}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    </Screen>
  );
}

function SectionHeader({ onSeeMore, title }: { onSeeMore: () => void; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="cardTitle">{title}</AppText>
      <Pressable accessibilityRole="button" onPress={onSeeMore}>
        <AppText color="accent" variant="caption">
          See more
        </AppText>
      </Pressable>
    </View>
  );
}

function QuickAction({ icon: Icon, label, onPress }: { icon: typeof Lightbulb; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <Icon color={colors.accent} size={20} strokeWidth={1.8} />
      <AppText style={styles.quickLabel} variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[5] },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  reminderCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[2],
    marginTop: spacing[5],
    padding: spacing[4],
  },
  reminderHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  reminderActions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  reminderAllow: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[5],
  },
  reminderLater: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing[4] },
  headerText: { flex: 1 },
  greeting: { marginTop: spacing[2] },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.round,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarImage: { borderRadius: radii.round, height: '100%', width: '100%' },
  avatarText: { fontFamily: fontFamilies.heading.semiBold, fontSize: 18, lineHeight: 22 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
    marginTop: spacing[6],
  },
  quickGrid: { flexDirection: 'row', gap: spacing[2] },
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 68,
    paddingHorizontal: spacing[1],
  },
  quickLabel: { textAlign: 'center' },
  pressed: { opacity: 0.72 },
  yearTabs: { gap: spacing[2], justifyContent: 'flex-end', paddingBottom: spacing[3] },
  yearPill: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    minWidth: 62,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  yearPillActive: { borderColor: colors.accent },
  memoryCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 92,
    padding: spacing[3],
  },
  memoryThumbnail: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.control,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  memoryCopy: { flex: 1, gap: spacing[2] },
  memoryText: { fontSize: 14, lineHeight: 19 },
  emptyMemory: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[6],
  },
  promptCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[5],
    padding: spacing[5],
  },
  promptKicker: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  promptQuestion: { fontSize: 20, lineHeight: 27 },
  promptFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  reflectPill: {
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  insightCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  insightIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  insightCopy: { flex: 1, gap: spacing[1] },
  streakCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[4],
    padding: spacing[4],
  },
  streakMain: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  streakDetails: { flex: 1, gap: spacing[3] },
  weekRow: { flexDirection: 'row', gap: spacing[2] },
  weekDay: { alignItems: 'center', flex: 1, gap: spacing[1] },
  dayBar: { backgroundColor: colors.line, borderRadius: radii.round, height: 6, width: '100%' },
  dayBarLogged: { backgroundColor: colors.accent },
});
