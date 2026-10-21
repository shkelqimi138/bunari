// Card container component with the app's surface styling
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radii, shadows, spacing } from '@/theme/tokens';

type CardProps = PropsWithChildren<
  ViewProps & {
    accent?: boolean;
  }
>;

export function Card({ accent = false, children, style, ...props }: CardProps) {
  return (
    <View {...props} style={[styles.base, accent && styles.accent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[4],
    ...shadows.card,
  },
  accent: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.prompt,
  },
});
