// Web preview journal export as a download
import type { JournalEntry, JournalFolder, Trip } from '@/domain/journal';
import { journalExportHtml } from './export-data';

export async function exportJournal(entries: JournalEntry[], trips: Trip[], folders: JournalFolder[]) {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([journalExportHtml(entries, trips, folders)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `bunari-journal-${date}.html`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    return { error: null };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : 'Journal export failed.' };
  }
}
