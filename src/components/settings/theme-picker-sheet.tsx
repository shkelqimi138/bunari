// Bunari's own theme picker: a sheet with a small preview of each theme
import { Check, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { colors, darkPalette, lightPalette, radii, spacing, type AppTheme } from '@/theme/tokens';

type ThemePickerSheetProps = {
  onClose: () => void;
  onSelect: (theme: AppTheme) => void;
  selected: AppTheme;
  visible: boolean;
};

const themes = [
  { id: 'dark', label: 'Dark', palette: darkPalette },
  { id: 'light', label: 'Warm light', palette: lightPalette },
] as const;

export function ThemePickerSheet({ onClose, onSelect, selected, visible }: ThemePickerSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessible={false} onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessible={false}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing[5] }]}
        >
          <View style={styles.header}>
            <AppText accessibilityRole="header" variant="cardTitle">
              Theme
            </AppText>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={12} onPress={onClose}>
              <X color={colors.textDim} size={20} />
            </Pressable>
          </View>
          <View accessibilityRole="radiogroup" style={styles.cards}>
            {themes.map((theme) => (
              <ThemeCard
                key={theme.id}
                label={theme.label}
                onPress={() => onSelect(theme.id)}
                palette={theme.palette}
                selected={selected === theme.id}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A small Bunari screen drawn in the theme's own colors, whatever the current theme is.
function ThemeCard({
  label,
  onPress,
  palette,
  selected,
}: {
  label: string;
  onPress: () => void;
  palette: typeof darkPalette | typeof lightPalette;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      <View style={[styles.preview, { backgroundColor: palette.background, borderColor: palette.line }]}>
        <View style={[styles.line, styles.titleLine, { backgroundColor: palette.text }]} />
        <View style={[styles.previewCard, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <View style={[styles.line, { backgroundColor: palette.textDim, width: '85%' }]} />
          <View style={[styles.line, { backgroundColor: palette.textDim, width: '60%' }]} />
          <View style={[styles.pill, { backgroundColor: palette.accent }]} />
        </View>
        <View style={[styles.previewCard, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <View style={[styles.line, { backgroundColor: palette.textDim, width: '70%' }]} />
        </View>
      </View>
      <View style={styles.cardFooter}>
        <AppText color={selected ? 'accent' : 'primary'}>{label}</AppText>
        {selected ? <Check color={colors.accent} size={18} strokeWidth={2.2} /> : <View style={styles.radio} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    gap: spacing[5],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cards: { flexDirection: 'row', gap: spacing[3] },
  card: {
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1.5,
    flex: 1,
    gap: spacing[3],
    padding: spacing[3],
  },
  cardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pressed: { opacity: 0.8 },
  preview: {
    aspectRatio: 0.82,
    borderRadius: radii.control,
    borderWidth: 1,
    gap: spacing[2],
    overflow: 'hidden',
    padding: spacing[3],
  },
  titleLine: { height: 7, marginBottom: spacing[1], width: '45%' },
  line: { borderRadius: 3, height: 5 },
  previewCard: { borderRadius: radii.small, borderWidth: 1, gap: spacing[2], padding: spacing[2] },
  pill: { borderRadius: radii.round, height: 9, marginTop: spacing[1], width: '40%' },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 24 },
  radio: { borderColor: colors.textDim, borderRadius: radii.round, borderWidth: 1.5, height: 18, width: 18 },
});
