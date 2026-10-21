// Root layout: fonts, providers, and the app navigation stack
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PhotoPickerProvider } from '@/components/photos/photo-picker';
import { colors } from '@/theme/tokens';
import { JournalProvider, useJournal } from '@/state/journal-context';
import { PromptProvider, usePrompts } from '@/state/prompt-context';
import { AuthProvider, useAuth } from '@/state/auth-context';
import { PrivateJournalProvider } from '@/state/private-journal-context';
import { SettingsProvider, useSettings } from '@/state/settings-context';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  const fontsReady = fontsLoaded || Boolean(fontError);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <AuthProvider>
        <SettingsProvider>
          <PrivateJournalProvider>
            <JournalProvider>
              <PromptProvider>
                <PhotoPickerProvider>
                  <RootNavigator fontsReady={fontsReady} />
                </PhotoPickerProvider>
              </PromptProvider>
            </JournalProvider>
          </PrivateJournalProvider>
        </SettingsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { isLoading, isPasswordRecovery, session } = useAuth();
  const { ready: journalReady } = useJournal();
  const { ready: promptsReady } = usePrompts();
  const { theme } = useSettings();

  if (!fontsReady || isLoading || !journalReady || !promptsReady) {
    return (
      <View style={styles.startup}>
        <Text style={styles.brand}>BUNARI</Text>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Protected guard={Boolean(session) && !isPasswordRecovery}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="entry/new" />
          <Stack.Screen name="entry/[entryId]" />
          <Stack.Screen name="daily-prompt" />
          <Stack.Screen name="journal/[sectionId]" />
          <Stack.Screen name="private" />
          <Stack.Screen name="my-prompts" />
          <Stack.Screen name="on-this-day" />
          <Stack.Screen name="prompt/[promptId]" />
          <Stack.Screen name="prompt/category/[categoryId]" />
          <Stack.Screen name="streak" />
          <Stack.Screen name="templates" />
          <Stack.Screen name="travel/index" />
          <Stack.Screen name="travel/[tripId]" />
          <Stack.Screen name="weekly-summary" />
          <Stack.Screen name="recently-deleted" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  startup: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 14,
    justifyContent: 'center',
  },
  brand: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
  },
});
