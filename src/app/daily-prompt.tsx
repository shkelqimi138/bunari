// Screen showing today's AI daily prompt and starting an entry from it
import { useRouter } from 'expo-router';
import { ChevronLeft, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useDailyPrompt } from '@/hooks/use-daily-prompt';
import { colors, radii, spacing } from '@/theme/tokens';

export default function DailyPromptScreen() {
  const router = useRouter();
  // The prompt Today showed; this screen never loads a new one, so it cannot change while read.
  const { minutes, prompt, source } = useDailyPrompt({ load: false });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <AppText variant="screenTitle">Daily Prompt</AppText>
        <View style={styles.spacer} />
      </View>
      <View style={styles.card}>
        <View style={styles.kicker}>
          <Sparkles color={colors.accent} size={19} />
          <AppText color="accent" variant="label">
            {source === 'ai' ? 'MADE FOR TODAY BY AI' : 'TODAY'}
          </AppText>
        </View>
        <AppText style={styles.prompt} variant="prompt">
          {prompt}
        </AppText>
        <AppText color="dim" numeric variant="caption">
          ≈ {minutes} min
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/entry/new', params: { prompt, sectionId: 'home' } })}
        style={styles.button}
      >
        <AppText color="onAccent" variant="cardTitle">
          Write from this prompt
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[8],
    marginTop: spacing[4],
  },
  spacer: { width: 44 },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[6],
    padding: spacing[6],
  },
  kicker: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  prompt: { fontSize: 24, lineHeight: 31 },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.control,
    justifyContent: 'center',
    marginTop: spacing[6],
    minHeight: 48,
  },
});
