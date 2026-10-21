// Web/other preview: notes are shared as plain text only
import { Share } from 'react-native';

import type { JournalEntry } from '@/domain/journal';
import type { darkPalette } from '@/theme/tokens';
import { noteText } from './note-html';

type Palette = { [Key in keyof typeof darkPalette]: string };

export async function shareNoteAsPdf(
  entry: JournalEntry,
  _options: { folderName?: string | null; palette: Palette; saved?: JournalEntry },
) {
  await Share.share({ message: noteText(entry), title: entry.title });
  return { error: null };
}

export async function shareNoteAsText(entry: JournalEntry) {
  await Share.share({ message: noteText(entry), title: entry.title });
}
