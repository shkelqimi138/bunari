// Screen wrapper with safe area, padding, and keyboard-aware scrolling
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function Screen({ children, scroll = false, style }: ScreenProps) {
  const content = scroll ? (
    // Keeps a focused field above the keyboard, lets a button work on the first tap
    // while the keyboard is open, and closes the keyboard with a swipe down.
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[styles.content, style]}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, style]}>{children}</View>
  );

  return <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
  },
});
