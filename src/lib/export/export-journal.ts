// Platform-neutral declaration of the journal export function
import type { JournalEntry, JournalFolder, Trip } from '@/domain/journal';

export declare function exportJournal(
  entries: JournalEntry[],
  trips: Trip[],
  folders: JournalFolder[],
): Promise<{ error: string | null }>;
