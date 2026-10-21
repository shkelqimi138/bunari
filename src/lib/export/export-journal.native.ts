// Writes the journal export to a file and opens the share sheet
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { JournalEntry, JournalFolder, Trip } from '@/domain/journal';
import { journalExportHtml } from './export-data';

export async function exportJournal(entries: JournalEntry[], trips: Trip[], folders: JournalFolder[]) {
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `bunari-journal-${date}.html`);
  try {
    if (!(await Sharing.isAvailableAsync())) return { error: 'File sharing is unavailable on this device.' };
    file.create({ overwrite: true });
    file.write(journalExportHtml(entries, trips, folders));
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Export readable journal',
      mimeType: 'text/html',
      UTI: 'public.html',
    });
    return { error: null };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : 'Journal export failed.' };
  } finally {
    // The export holds the whole journal; it is deleted once the share sheet closes.
    try {
      if (file.exists) file.delete();
    } catch {
      /* The system clears its cache folder later. */
    }
  }
}
