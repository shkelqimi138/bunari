// Text component applying the app's typography variants and colors
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fontFamilies, numericText, typography } from '@/theme/tokens';

type TextVariant = 'screenTitle' | 'greeting' | 'cardTitle' | 'body' | 'prompt' | 'streak' | 'label' | 'caption';

type AppTextProps = PropsWithChildren<
  TextProps & {
    color?: 'primary' | 'dim' | 'accent' | 'danger' | 'onAccent';
    numeric?: boolean;
    variant?: TextVariant;
  }
>;

const variantStyles: Record<TextVariant, TextStyle> = {
  screenTitle: { ...typography.screenTitle, fontFamily: fontFamilies.heading.semiBold },
  greeting: { ...typography.greeting, fontFamily: fontFamilies.heading.semiBold },
  cardTitle: { ...typography.cardTitle, fontFamily: fontFamilies.heading.semiBold },
  body: { ...typography.body, fontFamily: fontFamilies.body.regular },
  prompt: { ...typography.prompt, fontFamily: fontFamilies.heading.medium },
  streak: { ...typography.streak, fontFamily: fontFamilies.heading.semiBold },
  label: {
    ...typography.label,
    fontFamily: fontFamilies.body.semiBold,
    textTransform: 'uppercase',
  },
  caption: { ...typography.caption, fontFamily: fontFamilies.body.regular },
};

const textColors = {
  primary: colors.text,
  dim: colors.textDim,
  accent: colors.accent,
  danger: colors.danger,
  onAccent: colors.onAccent,
} as const;

export function AppText({
  children,
  color = 'primary',
  numeric = false,
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  return (
    <Text
      {...props}
      style={[styles.base, variantStyles[variant], { color: textColors[color] }, numeric && numericText, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
