// Mood suggestions: kept with the entry, and offered again only after its text changes
import type { JournalEntry } from '@/domain/journal';

// A short fingerprint (FNV-1a) of what the AI reads, so a change to the text is noticed. It only
// detects changes; it is not a security hash.
export function moodContentKey(entry: Pick<JournalEntry, 'description' | 'plainText' | 'title'>) {
  const text = [entry.title, entry.description, entry.plainText].map((part) => (part ?? '').trim()).join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(16)}-${hash.toString(16).padStart(8, '0')}`;
}

// 'fresh': the saved suggestion was written for the entry as it is now, so it is shown and not asked
// for again. 'stale': the entry changed since. 'none': nothing suggested yet.
export function moodSuggestionState(
  entry: Pick<JournalEntry, 'description' | 'moodSuggestion' | 'plainText' | 'title'>,
) {
  if (!entry.moodSuggestion) return 'none' as const;
  return entry.moodSuggestion.contentKey === moodContentKey(entry) ? ('fresh' as const) : ('stale' as const);
}
