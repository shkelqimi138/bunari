// Design tokens: colors, typography, spacing, and radii
import { DynamicColorIOS, Platform, type TextStyle, type ViewStyle } from 'react-native';

export type AppTheme = 'dark' | 'light';

export const darkPalette = {
  background: '#0b0a09',
  surface: '#161310',
  surfaceRaised: '#211c15',
  line: 'rgba(255,255,255,0.08)',
  text: '#f3efe8',
  textDim: '#8b8378',
  accent: '#d99a52',
  accentSoft: 'rgba(217,154,82,0.15)',
  onAccent: '#1a120a',
  danger: '#ef8f8f',
  dangerSoft: 'rgba(239,143,143,0.16)',
  reviewed: '#4da3ff',
  transparent: 'transparent',
} as const;

export const lightPalette = {
  background: '#f3eadc',
  surface: '#eadfce',
  surfaceRaised: '#dfcfb8',
  line: 'rgba(63,43,26,0.13)',
  text: '#2b2118',
  textDim: '#675440',
  accent: '#874512',
  accentSoft: 'rgba(168,100,39,0.14)',
  onAccent: '#fffaf2',
  danger: '#a83f3f',
  dangerSoft: 'rgba(168,63,63,0.12)',
  reviewed: '#2879bd',
  transparent: 'transparent',
} as const;

function adaptiveColor(name: keyof typeof darkPalette) {
  if (name === 'transparent') return 'transparent';
  if (Platform.OS === 'ios') {
    return DynamicColorIOS({ dark: darkPalette[name], light: lightPalette[name] }) as unknown as string;
  }
  if (Platform.OS === 'web') return `var(--journal-${name}, ${darkPalette[name]})`;
  return darkPalette[name];
}

export const colors = Object.fromEntries(
  Object.keys(darkPalette).map((name) => [name, adaptiveColor(name as keyof typeof darkPalette)]),
) as { [Key in keyof typeof darkPalette]: string };

export function applyWebTheme(theme: AppTheme) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const palette = theme === 'light' ? lightPalette : darkPalette;
  for (const [name, value] of Object.entries(palette)) {
    document.documentElement.style.setProperty(`--journal-${name}`, value);
  }
  document.documentElement.style.colorScheme = theme;
}

export const spacing = {
  0: 0,
  1: 3,
  2: 6,
  3: 10,
  4: 14,
  5: 17,
  6: 20,
  7: 24,
  8: 28,
  10: 34,
  12: 42,
} as const;

export const radii = {
  small: 8,
  control: 10,
  card: 14,
  prompt: 18,
  pill: 20,
  round: 999,
} as const;

export const layout = {
  screenPadding: 18,
  cardGap: 10,
  // Tab bar height above the home indicator, as in iOS's own tab bars.
  tabBarContentHeight: 49,
  tabBarMinimumBottomPadding: 8,
  minimumTouchTarget: 44,
} as const;

export const fontFamilies = {
  // The iPhone's own font (San Francisco), which the note editor's text uses too.
  system: 'System',
  heading: {
    medium: 'BricolageGrotesque_500Medium',
    semiBold: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
  },
  body: {
    light: 'HankenGrotesk_300Light',
    regular: 'HankenGrotesk_400Regular',
    medium: 'HankenGrotesk_500Medium',
    semiBold: 'HankenGrotesk_600SemiBold',
    bold: 'HankenGrotesk_700Bold',
  },
} as const;

export const typography = {
  screenTitle: { fontSize: 27, lineHeight: 31 },
  // A note's title: bold system font, a little larger than the note text (14, set in the editor's CSS).
  // Both grow with "Larger note text" in Account: see src/domain/note-text.ts.
  noteTitle: { fontSize: 17, lineHeight: 23 },
  greeting: { fontSize: 25, lineHeight: 28 },
  cardTitle: { fontSize: 14, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 23 },
  prompt: { fontSize: 19, lineHeight: 25 },
  streak: { fontSize: 27, lineHeight: 31 },
  label: { fontSize: 10, lineHeight: 14, letterSpacing: 1.2 },
  caption: { fontSize: 11, lineHeight: 15 },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 3,
  } satisfies ViewStyle,
} as const;

// Buttons drawn over a photo: the same in both themes, so they stay readable on any picture.
export const photoOverlay = {
  scrim: 'rgba(0,0,0,0.46)',
  icon: '#f3efe8',
} as const;

export const numericText: TextStyle = {
  fontVariant: ['tabular-nums'],
};
