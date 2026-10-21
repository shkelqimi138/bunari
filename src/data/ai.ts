// Client calls to the API for daily prompts, mood suggestions, and weekly summaries
import { apiRequest } from '@/lib/api';
import type { EntryMood } from '@/domain/journal';

export type DailyPromptResult = {
  cached: boolean;
  date: string;
  minutes: number;
  model: string;
  prompt: string;
  provider: string;
};

export type MoodSuggestion = {
  mood: EntryMood;
  reason: string;
};

export type WeeklySummary = {
  encouragement: string;
  headline: string;
  overview: string;
  patterns: string[];
};

export type WeeklySummaryResult = {
  cached: boolean;
  model: string;
  provider: string;
  summary: WeeklySummary;
};

export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function dailyPromptCacheKey(userId: string, date: string) {
  return `ai-daily-prompt.v1.${userId}.${date}`;
}

export function fetchDailyPrompt(date: string, timezone: string) {
  return apiRequest<DailyPromptResult>(
    `/v1/ai/daily-prompt?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`,
  );
}

export function fetchMoodSuggestion(entryId: string) {
  return apiRequest<MoodSuggestion>('/v1/ai/mood-suggestion', {
    body: JSON.stringify({ entryId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export function fetchWeeklySummary(periodStart: string, periodEnd: string) {
  return apiRequest<WeeklySummaryResult>(
    `/v1/ai/weekly-summary?start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`,
  );
}
