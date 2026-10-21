// Bottom tab navigator layout for the main app screens
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { BookOpen, CircleUserRound, PencilLine, Sparkles, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies, layout, typography } from '@/theme/tokens';

type TabIconProps = {
  color: ColorValue;
  focused: boolean;
  size: number;
};

function tabIcon(name: SFSymbol, Icon: LucideIcon) {
  return function TabIcon({ color, size }: TabIconProps) {
    const compactSize = Math.min(size, 21);
    return (
      <SymbolView
        fallback={<Icon color={color} size={compactSize} strokeWidth={1.8} />}
        name={{ ios: name }}
        size={compactSize}
        tintColor={color}
        weight="regular"
      />
    );
  };
}

export default function TabLayout() {
  // Keep the icons and labels above the home indicator, so a tap near the bottom edge
  // is not taken as the swipe-up-to-go-home gesture.
  const insets = useSafeAreaInsets();
  const tabBarPaddingTop = 6;
  const tabBarPaddingBottom = Math.max(insets.bottom, layout.tabBarMinimumBottomPadding);

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: {
          fontFamily: fontFamilies.body.semiBold,
          fontSize: typography.caption.fontSize,
          lineHeight: typography.caption.lineHeight,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: tabBarPaddingTop + layout.tabBarContentHeight + tabBarPaddingBottom,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: tabBarPaddingTop,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('square.and.pencil', PencilLine) }} />
      <Tabs.Screen name="journals" options={{ title: 'Journals', tabBarIcon: tabIcon('book.closed', BookOpen) }} />
      <Tabs.Screen name="prompts" options={{ title: 'Prompts', tabBarIcon: tabIcon('sparkles', Sparkles) }} />
      {/* Shown as Account; the route stays "more" so links and older code keep working. */}
      <Tabs.Screen
        name="more"
        options={{ title: 'Account', tabBarIcon: tabIcon('person.crop.circle', CircleUserRound) }}
      />
    </Tabs>
  );
}
