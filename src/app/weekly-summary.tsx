// Screen showing the AI weekly summary of recent entries
import { useRouter } from 'expo-router';
import { ChevronLeft, RefreshCw, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { fetchWeeklySummary, localDate, type WeeklySummary } from '@/data/ai';
import { weeklyInsightDisclosure } from '@/domain/ai-permission';
import { useAiPermission } from '@/hooks/use-ai-permission';
import { useSettings } from '@/state/settings-context';
import { colors, radii, spacing } from '@/theme/tokens';

function currentWeek() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { end: localDate(end), start: localDate(start) };
}

export default function WeeklySummaryScreen() {
  const router = useRouter();
  const [period] = useState(currentWeek);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // This week's entries go to OpenAI, so nothing is sent until the user allows it on this device.
  const { aiFeaturesAllowed, setAiFeaturesAllowed } = useSettings();
  const askForAi = useAiPermission();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchWeeklySummary(period.start, period.end);
      setSummary(result.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Weekly insight is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [period.end, period.start]);

  useEffect(() => {
    if (!aiFeaturesAllowed) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [aiFeaturesAllowed, load]);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <AppText variant="screenTitle">Weekly Insight</AppText>
        <IconButton
          accessibilityLabel="Refresh weekly insight"
          icon={RefreshCw}
          onPress={() => void (aiFeaturesAllowed ? load() : askForAi())}
        />
      </View>
      <AppText color="accent" numeric style={styles.period} variant="label">
        {period.start} — {period.end}
      </AppText>
      {!aiFeaturesAllowed ? (
        <View style={styles.stateCard}>
          <AppText variant="cardTitle">Weekly Insight uses AI</AppText>
          <AppText color="dim">{weeklyInsightDisclosure}</AppText>
          <Pressable accessibilityRole="button" onPress={() => setAiFeaturesAllowed(true)}>
            <AppText color="accent">Allow and show my week</AppText>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.stateCard}>
          <AppText color="dim">Finding patterns in your week…</AppText>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <AppText variant="cardTitle">Insight unavailable</AppText>
          <AppText color="dim">{error}</AppText>
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <AppText color="accent">Try again</AppText>
          </Pressable>
        </View>
      ) : summary ? (
        <View style={styles.summaryCard}>
          <View style={styles.kicker}>
            <Sparkles color={colors.accent} size={19} />
            <AppText color="accent" variant="label">
              YOUR WEEK
            </AppText>
          </View>
          <AppText variant="greeting">{summary.headline}</AppText>
          <AppText color="dim">{summary.overview}</AppText>
          <View style={styles.divider} />
          <AppText variant="cardTitle">Patterns</AppText>
          {summary.patterns.map((pattern) => (
            <View key={pattern} style={styles.pattern}>
              <View style={styles.dot} />
              <AppText style={styles.patternText}>{pattern}</AppText>
            </View>
          ))}
          <View style={styles.encouragement}>
            <AppText color="accent">{summary.encouragement}</AppText>
          </View>
        </View>
      ) : null}
      <AppText color="dim" style={styles.privacy} variant="caption">
        {summary && aiFeaturesAllowed ? 'Written by AI from your regular entries. ' : ''}Private entries are never
        included.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[4] },
  period: { marginBottom: spacing[5], marginTop: spacing[4], textAlign: 'center' },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[5],
  },
  summaryCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[5],
    padding: spacing[5],
  },
  kicker: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  divider: { backgroundColor: colors.line, height: 1 },
  pattern: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] },
  dot: { backgroundColor: colors.accent, borderRadius: radii.round, height: 7, marginTop: 8, width: 7 },
  patternText: { flex: 1 },
  encouragement: { backgroundColor: colors.accentSoft, borderRadius: radii.control, padding: spacing[4] },
  privacy: { marginTop: spacing[5], textAlign: 'center' },
});
