// Screen of entry templates that start a pre-filled new entry
import { useRouter } from 'expo-router';
import {
  CalendarCheck,
  ChevronLeft,
  Dumbbell,
  Heart,
  ListChecks,
  type LucideIcon,
  Moon,
  Plane,
  Sunrise,
  Wallet,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { colors, radii, spacing } from '@/theme/tokens';

// A folder that was deleted falls back to Notes when the entry is created.
const templates: {
  body: string;
  description: string;
  icon: LucideIcon;
  sectionId: 'home' | 'todo' | 'fitness' | 'finance' | 'thoughts';
  title: string;
}[] = [
  {
    title: 'Morning pages',
    description: 'Clear your head before the day starts',
    body: 'How I feel this morning\n\nWhat is on my mind\n\nOne thing I want from today',
    icon: Sunrise,
    sectionId: 'home',
  },
  {
    title: 'Daily reflection',
    description: 'Close the day with intention',
    body: 'What felt meaningful today?\n\nWhat can I leave here?\n\nWhat do I want to remember?',
    icon: CalendarCheck,
    sectionId: 'home',
  },
  {
    title: 'Gratitude list',
    description: 'Three good things, big or small',
    body: 'Something that went well\n\nSomeone I am thankful for\n\nA small pleasure from today',
    icon: Heart,
    sectionId: 'thoughts',
  },
  {
    title: 'Evening wind-down',
    description: 'Set today down before sleep',
    body: 'What I finished\n\nWhat can wait until tomorrow\n\nHow I want to wake up',
    icon: Moon,
    sectionId: 'thoughts',
  },
  {
    title: 'Weekly reset',
    description: 'Clear priorities for the week',
    body: 'Top three priorities\n\nThings to follow up\n\nSpace I want to protect',
    icon: ListChecks,
    sectionId: 'todo',
  },
  {
    title: 'Workout notes',
    description: 'Track effort and recovery',
    body: 'Session\n\nWhat felt strong\n\nWhat needs attention next time',
    icon: Dumbbell,
    sectionId: 'fitness',
  },
  {
    title: 'Trip day',
    description: 'Keep the day while it is fresh',
    body: 'Where I went\n\nBest moment\n\nSomething I want to remember',
    icon: Plane,
    sectionId: 'home',
  },
  {
    title: 'Money check-in',
    description: 'A calm look at spending',
    body: 'What I spent this week\n\nWhat felt worth it\n\nOne thing to change',
    icon: Wallet,
    sectionId: 'finance',
  },
];

export default function TemplatesScreen() {
  const router = useRouter();
  return (
    <Screen scroll style={styles.screen}>
      <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="screenTitle">Templates</AppText>
        <AppText color="dim" style={styles.subtitle}>
          A little structure when the page feels too open
        </AppText>
      </View>
      <View style={styles.list}>
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <Pressable
              accessibilityLabel={`Use ${template.title} template`}
              accessibilityRole="button"
              key={template.title}
              onPress={() =>
                router.push({
                  pathname: '/entry/new',
                  params: {
                    body: template.body,
                    sectionId: template.sectionId,
                    title: template.title,
                  },
                })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <Icon color={colors.accent} size={21} strokeWidth={1.8} />
              </View>
              <View style={styles.copy}>
                <AppText variant="cardTitle">{template.title}</AppText>
                <AppText color="dim" variant="caption">
                  {template.description}
                </AppText>
              </View>
              <AppText color="accent" variant="caption">
                Use
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  header: { marginTop: spacing[5] },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  list: { gap: spacing[3], marginTop: spacing[6] },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 76,
    padding: spacing[4],
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: { flex: 1, gap: spacing[1] },
  pressed: { opacity: 0.72 },
});
