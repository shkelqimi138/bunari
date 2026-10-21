// Round icon button component
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, layout, radii } from '@/theme/tokens';

type IconButtonProps = PressableProps & {
  icon: LucideIcon;
  // Overrides the tone's icon color, e.g. a light icon over a photo.
  iconColor?: string;
  tone?: 'default' | 'accent';
};

export function IconButton({
  accessibilityLabel,
  icon: Icon,
  iconColor: iconColorOverride,
  style,
  tone = 'default',
  ...props
}: IconButtonProps) {
  const iconColor = iconColorOverride ?? (tone === 'accent' ? colors.accent : colors.textDim);

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      style={(state) => [
        styles.base,
        tone === 'accent' && styles.accent,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Icon color={iconColor} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
  accent: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.7,
  },
});
