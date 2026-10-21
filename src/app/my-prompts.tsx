// Screen listing the user's saved prompts
import { useRouter } from 'expo-router';
import { Bookmark, ChevronLeft } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PromptRow } from '@/components/prompts/prompt-ui';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { getPromptCategory } from '@/domain/prompts';
import { usePrompts } from '@/state/prompt-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function MyPromptsScreen() {
  const router = useRouter();
  const { savedPrompts } = usePrompts();
  return (
    <Screen scroll style={styles.screen}>
      <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="screenTitle">My Prompts</AppText>
        <AppText color="dim" style={styles.subtitle}>
          Questions you saved across every category
        </AppText>
      </View>

      {savedPrompts.length ? (
        <View style={styles.list}>
          {savedPrompts.map((prompt) => {
            const category = getPromptCategory(prompt.categoryId);
            return category ? <PromptRow category={category} key={prompt.id} prompt={prompt} saved /> : null;
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Bookmark color={colors.accent} size={28} strokeWidth={1.7} />
          <AppText variant="cardTitle">No saved prompts yet</AppText>
          <AppText color="dim" style={styles.emptyCopy}>
            Save any prompt and it will appear here.
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  header: { marginTop: spacing[5] },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: spacing[6],
    paddingHorizontal: spacing[4],
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[3],
    marginTop: spacing[6],
    padding: spacing[8],
  },
  emptyCopy: { textAlign: 'center' },
});
