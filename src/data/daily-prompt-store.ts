// Today's daily prompt, kept once for the whole app so every screen shows the same one
import type { DailyPromptResult } from '@/data/ai';

export type DailyPromptLoader = {
  fetch: (date: string) => Promise<DailyPromptResult>;
  readCache: (userId: string, date: string) => Promise<DailyPromptResult | null>;
  writeCache: (userId: string, date: string, result: DailyPromptResult) => Promise<void>;
};

// The AI prompt for one user and day; `remote` stays null while only the built-in prompt is shown.
export type DailyPromptSnapshot = { date: string; remote: DailyPromptResult | null; userId: string };

// How long a failed load waits before the next try. The server counts every new prompt it asks the
// AI for against the account's daily AI limit, failed ones too, so retrying at once during an AI
// outage could use up the limit that mood suggestions and weekly summaries also need.
export const dailyPromptRetryDelayMs = 60_000;
// Once that limit is reached; it resets at midnight UTC, which is not the phone's midnight.
export const dailyPromptLimitRetryDelayMs = 60 * 60_000;

function isDailyLimitReached(error: unknown) {
  return (error as { code?: unknown } | null)?.code === 'ai_limit_reached';
}

export function createDailyPromptStore(loader: DailyPromptLoader, now: () => number = Date.now) {
  let snapshot: DailyPromptSnapshot | null = null;
  let running: { key: string; promise: Promise<void> } | null = null;
  let failed: { key: string; retryAt: number } | null = null;
  const listeners = new Set<() => void>();
  const isCurrent = (userId: string, date: string) => snapshot?.userId === userId && snapshot.date === date;
  const publish = (next: DailyPromptSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    // Loads the day's AI prompt (the saved copy first, then the server) unless it is already shown.
    // A failed load leaves the built-in prompt, and a call after the wait above tries again; calls
    // while a load is running share it, so the screens never fetch twice at once.
    load(userId: string, date: string): Promise<void> {
      if (isCurrent(userId, date) && snapshot?.remote) return Promise.resolve();
      const key = `${userId}|${date}`;
      if (running?.key === key) return running.promise;
      if (!isCurrent(userId, date)) publish({ date, remote: null, userId });
      if (failed?.key === key && now() < failed.retryAt) return Promise.resolve();
      const promise = (async () => {
        try {
          const cached = await loader.readCache(userId, date).catch(() => null);
          if (cached?.date === date && isCurrent(userId, date)) publish({ date, remote: cached, userId });
          const result = await loader.fetch(date);
          if (failed?.key === key) failed = null;
          if (isCurrent(userId, date)) publish({ date, remote: result, userId });
          await loader.writeCache(userId, date, result).catch(() => undefined);
        } catch (error) {
          // The saved or built-in prompt stays until the next try.
          failed = {
            key,
            retryAt: now() + (isDailyLimitReached(error) ? dailyPromptLimitRetryDelayMs : dailyPromptRetryDelayMs),
          };
        } finally {
          if (running?.key === key) running = null;
        }
      })();
      running = { key, promise };
      return promise;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
