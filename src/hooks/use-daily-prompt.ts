// Hook that shows today's daily prompt, the same one on every screen
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { dailyPromptCacheKey, fetchDailyPrompt, localDate, type DailyPromptResult } from '@/data/ai';
import { createDailyPromptStore } from '@/data/daily-prompt-store';
import { readLocalJson, writeLocalJson } from '@/data/local-store';
import { dailyPromptFor } from '@/domain/prompts';
import { useAuth } from '@/state/auth-context';

// One prompt for the whole app: Today, the Daily Prompt screen, and "Write from this prompt" always
// agree, and a load that failed is tried again when Today is shown again or the app comes back.
const dailyPromptStore = createDailyPromptStore({
  fetch: (date) => fetchDailyPrompt(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
  readCache: (userId, date) => readLocalJson<DailyPromptResult>(dailyPromptCacheKey(userId, date)),
  writeCache: (userId, date, result) => writeLocalJson(dailyPromptCacheKey(userId, date), result),
});

// `load: false` only shows the prompt already loaded, so it cannot change while it is being read.
export function useDailyPrompt({ load = true }: { load?: boolean } = {}) {
  const userId = useAuth().user?.id;
  const [date, setDate] = useState(localDate);
  const fallback = useMemo(() => dailyPromptFor(new Date(`${date}T12:00:00`)), [date]);
  const snapshot = useSyncExternalStore(dailyPromptStore.subscribe, dailyPromptStore.getSnapshot);

  // While the screen is shown: loads the prompt, and tries again when the app comes back if only
  // the built-in one is shown.
  useFocusEffect(
    useCallback(() => {
      if (!load || !userId) return;
      void dailyPromptStore.load(userId, date);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void dailyPromptStore.load(userId, localDate());
      });
      return () => subscription.remove();
    }, [date, load, userId]),
  );

  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 1, 0);
    const timer = setTimeout(() => setDate(localDate()), midnight.getTime() - now.getTime());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDate(localDate());
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [date]);

  const remote = snapshot?.userId === userId && snapshot?.date === date ? snapshot.remote : null;

  return {
    minutes: remote?.minutes ?? fallback.minutes,
    prompt: remote?.prompt ?? fallback.text,
    source: remote ? ('ai' as const) : ('built-in' as const),
  };
}
