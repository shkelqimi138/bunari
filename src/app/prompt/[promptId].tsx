// Prompt detail screen for saving a prompt or writing an entry from it
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, BookmarkCheck, ChevronLeft, PencilLine, Sparkles } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/prompts/prompt-ui';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { getPrompt, getPromptCategory } from '@/domain/prompts';
import { usePrompts } from '@/state/prompt-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function PromptDetailScreen() {
  const router = useRouter();
  const { promptId } = useLocalSearchParams<{ promptId?: string }>();
  const prompt = getPrompt(promptId);
  const category = getPromptCategory(prompt?.categoryId);
  const { isSaved, toggleSavedPrompt } = usePrompts();

  if (!prompt || !category) {
    return (
      <Screen style={styles.notFound}>
        <AppText variant="screenTitle">Prompt not found</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <AppText color="accent">Go back</AppText>
        </Pressable>
      </Screen>
    );
  }

  const saved = isSaved(prompt.id);
  return (
    <Screen style={styles.screen}>
      <View style={styles.topBar}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <IconButton
          accessibilityLabel={saved ? 'Remove from My Prompts' : 'Save to My Prompts'}
          icon={saved ? BookmarkCheck : Bookmark}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleSavedPrompt(prompt.id);
          }}
          tone={saved ? 'accent' : 'default'}
        />
      </View>

      <View style={styles.promptCard}>
        <View style={styles.kicker}>
          <Sparkles color={colors.accent} size={18} strokeWidth={1.8} />
          <AppText color="accent" variant="label">
            {category.name}
          </AppText>
        </View>
        <AppText style={styles.question} variant="prompt">
          {prompt.text}
        </AppText>
        <View style={styles.meta}>
          <View style={styles.categoryIcon}>
            <CategoryIcon category={category} size={17} />
          </View>
          <AppText color="dim" numeric variant="caption">
            ≈ {prompt.minutes} min
          </AppText>
        </View>
      </View>

      <Pressable
        accessibilityLabel="Write from this prompt"
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/entry/new', params: { prompt: prompt.text, sectionId: 'home' } })}
        style={({ pressed }) => [styles.writeButton, pressed && styles.pressed]}
      >
        <PencilLine color={colors.onAccent} size={19} strokeWidth={1.9} />
        <AppText color="onAccent" variant="cardTitle">
          Write from this prompt
        </AppText>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => toggleSavedPrompt(prompt.id)} style={styles.saveLink}>
        <AppText color="accent" variant="caption">
          {saved ? 'Remove from My Prompts' : 'Save to My Prompts'}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingBottom: spacing[8], paddingTop: spacing[3] },
  notFound: { gap: spacing[4], justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  promptCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
    borderWidth: 1,
    gap: spacing[6],
    marginTop: spacing[8],
    padding: spacing[6],
  },
  kicker: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  question: { fontSize: 24, lineHeight: 31 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.small,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  writeButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 'auto',
  },
  saveLink: { alignItems: 'center', minHeight: 44, paddingTop: spacing[3] },
  pressed: { opacity: 0.75 },
});
