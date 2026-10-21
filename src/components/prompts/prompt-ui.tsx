// Shared prompt category icon and prompt row components
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Clock3,
  Heart,
  Lightbulb,
  Smile,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { type JournalPrompt, type PromptCategory } from '@/domain/prompts';
import { colors, radii, spacing } from '@/theme/tokens';

const categoryIcons: Record<PromptCategory['icon'], LucideIcon> = {
  activity: Activity,
  calendar: CalendarDays,
  clock: Clock3,
  heart: Heart,
  lightbulb: Lightbulb,
  smile: Smile,
  sparkles: Sparkles,
  sun: Sun,
};

export function CategoryIcon({ category, size = 20 }: { category: PromptCategory; size?: number }) {
  const Icon = categoryIcons[category.icon];
  return <Icon color={colors.accent} size={size} strokeWidth={1.8} />;
}

export function PromptRow({
  category,
  prompt,
  saved,
}: {
  category: PromptCategory;
  prompt: JournalPrompt;
  saved: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel={`Open prompt: ${prompt.text}`}
      accessibilityRole="button"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: '/prompt/[promptId]', params: { promptId: prompt.id } });
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <CategoryIcon category={category} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <AppText style={styles.question}>{prompt.text}</AppText>
        <AppText color="dim" numeric variant="caption">
          {category.name} · ≈ {prompt.minutes} min{saved ? ' · Saved' : ''}
        </AppText>
      </View>
      <ChevronRight color={colors.textDim} size={18} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 78,
    paddingVertical: spacing[3],
  },
  pressed: { opacity: 0.7 },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowCopy: { flex: 1, gap: spacing[1] },
  question: { fontSize: 14, lineHeight: 19 },
});
