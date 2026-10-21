// Recently Deleted rules: a deleted entry is kept for 30 days, then deleted for good
import type { JournalEntry } from '@/domain/journal';

// Must match recentlyDeletedDays in server/purge-deleted.mjs, which deletes them on the server.
export const recentlyDeletedDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

export function isDeleted(entry: Pick<JournalEntry, 'deletedAt'>) {
  return Boolean(entry.deletedAt);
}

// Whole days left before the entry is deleted for good: 30 right after deleting, 1 on its last day.
export function deletedDaysLeft(deletedAt: string, now: Date = new Date()) {
  const left = Date.parse(deletedAt) + recentlyDeletedDays * dayMs - now.getTime();
  return Math.max(0, Math.ceil(left / dayMs));
}

export function isExpired(deletedAt: string | null | undefined, now: Date = new Date()) {
  return Boolean(deletedAt) && Date.parse(deletedAt!) + recentlyDeletedDays * dayMs <= now.getTime();
}

// Entries that are not deleted, in their original order.
export function liveEntries<T extends Pick<JournalEntry, 'deletedAt'>>(entries: T[]) {
  return entries.filter((entry) => !isDeleted(entry));
}

// Deleted entries, the most recently deleted first.
export function deletedEntries<T extends Pick<JournalEntry, 'deletedAt'>>(entries: T[]) {
  return entries.filter(isDeleted).sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!));
}

// "12 days left", "1 day left", or "Deleted soon" once its time is up.
export function deletedDaysLeftLabel(deletedAt: string, now: Date = new Date()) {
  const days = deletedDaysLeft(deletedAt, now);
  if (days === 0) return 'Deleted soon';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

// Ids of entries deleted more than 30 days ago, which are deleted for good.
export function expiredIds<T extends { deletedAt?: string | null; id: string }>(items: T[], now: Date = new Date()) {
  return items.filter((item) => isExpired(item.deletedAt, now)).map((item) => item.id);
}
