// Prompts screen listing prompt categories and saved prompts
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon, PromptRow } from '@/components/prompts/prompt-ui';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { dailyPicks, getPromptCategory, promptCategories, promptsForCategory } from '@/domain/prompts';
import { usePrompts } from '@/state/prompt-context';
import { colors, layout, radii, spacing } from '@/theme/tokens';

export default function PromptsScreen() {
  const router = useRouter();
  const { isSaved, savedPrompts } = usePrompts();
  // The picks change every day; the date is read again whenever the tab is shown.
  const [today, setToday] = useState(() => new Date());
  useFocusEffect(useCallback(() => setToday(new Date()), []));
  const picks = dailyPicks(today);

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="screenTitle">Prompts</AppText>
          <AppText color="dim" style={styles.subtitle}>
            A question for every corner of the year
          </AppText>
        </View>
        <Pressable
          accessibilityLabel="Open My Prompts"
          accessibilityRole="button"
          onPress={() => router.push('/my-prompts')}
          style={({ pressed }) => [styles.savedButton, pressed && styles.pressed]}
        >
          <Bookmark color={colors.accent} size={19} strokeWidth={1.8} />
          <AppText color="accent" numeric variant="caption">
            {savedPrompts.length}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.picks}>
        <AppText variant="cardTitle">{"Today's picks"}</AppText>
        <AppText color="dim" variant="caption">
          Three questions, new every day
        </AppText>
        <View style={styles.picksList}>
          {picks.map((prompt) => {
            const category = getPromptCategory(prompt.categoryId);
            return category ? (
              <PromptRow category={category} key={prompt.id} prompt={prompt} saved={isSaved(prompt.id)} />
            ) : null;
          })}
        </View>
      </View>

      <View style={styles.grid}>
        {promptCategories.map((category) => {
          const count = promptsForCategory(category.id).length;
          return (
            <Pressable
              accessibilityLabel={`Open ${category.name} prompts`}
              accessibilityRole="button"
              key={category.id}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/prompt/category/[categoryId]', params: { categoryId: category.id } });
              }}
              style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
            >
              <View style={styles.iconChip}>
                <CategoryIcon category={category} />
              </View>
              <AppText style={styles.categoryName} variant="cardTitle">
                {category.name}
              </AppText>
              <AppText color="dim" numberOfLines={2} style={styles.description}>
                {category.description}
              </AppText>
              <AppText color="accent" numeric style={styles.count} variant="label">
                {count} prompts
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/my-prompts')}
        style={({ pressed }) => [styles.myPrompts, pressed && styles.pressed]}
      >
        <View>
          <AppText variant="cardTitle">My Prompts</AppText>
          <AppText color="dim" variant="caption">
            All your saved questions in one place
          </AppText>
        </View>
        <AppText color="accent" numeric variant="label">
          {savedPrompts.length} saved
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[6] },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  headerCopy: { flex: 1 },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  savedButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing[3],
  },
  picks: { gap: spacing[1], marginTop: spacing[6] },
  picksList: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginTop: spacing[6] },
  categoryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: 138,
    padding: spacing[4],
    width: '48%',
  },
  iconChip: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  categoryName: { fontSize: 15, marginTop: spacing[4] },
  description: { fontSize: 12, lineHeight: 17, marginTop: spacing[1] },
  count: { marginTop: 'auto', paddingTop: spacing[3] },
  myPrompts: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[3],
    padding: spacing[4],
  },
  pressed: { opacity: 0.72 },
});
