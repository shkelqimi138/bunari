// Screen listing the prompts in one category
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, ChevronLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon, PromptRow } from '@/components/prompts/prompt-ui';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { getPromptCategory, promptsForCategoryOn } from '@/domain/prompts';
import { usePrompts } from '@/state/prompt-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function PromptCategoryScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const category = getPromptCategory(categoryId);
  const { isSaved } = usePrompts();
  // The day is read when the screen is shown, so the order does not jump while it stays open.
  const [today, setToday] = useState(() => new Date());
  useFocusEffect(useCallback(() => setToday(new Date()), []));

  if (!category) {
    return (
      <Screen style={styles.notFound}>
        <AppText variant="screenTitle">Category not found</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <AppText color="accent">Go back</AppText>
        </Pressable>
      </Screen>
    );
  }

  // A different order every day, so the first prompts change.
  const prompts = promptsForCategoryOn(category.id, today);
  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.topBar}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/my-prompts')} style={styles.myPromptsButton}>
          <Bookmark color={colors.accent} size={17} strokeWidth={1.8} />
          <AppText color="accent" variant="caption">
            My Prompts
          </AppText>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <CategoryIcon category={category} size={24} />
        </View>
        <AppText variant="screenTitle">{category.name}</AppText>
        <AppText color="dim" style={styles.subtitle}>
          {category.description}
        </AppText>
        <AppText color="accent" numeric variant="label">
          {prompts.length} prompts
        </AppText>
      </View>
      <View style={styles.list}>
        {prompts.map((prompt) => (
          <PromptRow category={category} key={prompt.id} prompt={prompt} saved={isSaved(prompt.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  notFound: { gap: spacing[4], justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  myPromptsButton: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minHeight: 44 },
  hero: { gap: spacing[2], marginTop: spacing[5] },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing[1],
    width: 44,
  },
  subtitle: { fontSize: 14, lineHeight: 19 },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: spacing[6],
    paddingHorizontal: spacing[4],
  },
});
