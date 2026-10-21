// Builds the reader-friendly journal export (Private entries excluded)
import { defaultFolders, type JournalEntry, type JournalFolder, type Trip } from '@/domain/journal';
import { storedDateToTyped } from '@/domain/typed-date';
import { escapeHtml } from '@/lib/export/note-html';

function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function journalExportHtml(entries: JournalEntry[], trips: Trip[], folders: JournalFolder[] = defaultFolders) {
  const publicEntries = entries
    .filter((entry) => entry.sectionId !== 'private')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const sectionNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  const tripNames = new Map(trips.map((trip) => [trip.id, trip.destination]));
  const entryMarkup = publicEntries
    .map((entry) => {
      const metadata = [
        sectionNames.get(entry.sectionId),
        entry.mood,
        entry.locationLabel,
        entry.tripId ? tripNames.get(entry.tripId) : null,
      ]
        .filter(Boolean)
        .map((value) => `<span>${escapeHtml(String(value))}</span>`)
        .join('');
      const todos = entry.todoItems?.length
        ? `<ul class="todos">${entry.todoItems.map((item) => `<li>${item.completed ? '☑' : '☐'} ${escapeHtml(item.text)}</li>`).join('')}</ul>`
        : '';
      const photos = entry.attachments.length + (entry.coverUri ? 1 : 0);
      return `<article>
      <p class="date">${escapeHtml(readableDate(entry.createdAt))}</p>
      <h2>${escapeHtml(entry.title || 'Untitled entry')}</h2>
      ${entry.description ? `<p class="description">${escapeHtml(entry.description)}</p>` : ''}
      <div class="metadata">${metadata}</div>
      <div class="body">${escapeHtml(entry.plainText || '').replaceAll('\n', '<br>')}</div>
      ${todos}
      ${photos > 0 ? `<p class="photos">${photos} ${photos === 1 ? 'photo' : 'photos'} attached in Bunari</p>` : ''}
    </article>`;
    })
    .join('\n');
  const tripMarkup = [...trips]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map(
      (trip) =>
        `<li><strong>${escapeHtml(trip.emoji)} ${escapeHtml(trip.destination)}</strong><br><span>${escapeHtml(storedDateToTyped(trip.startDate))} – ${escapeHtml(storedDateToTyped(trip.endDate))}</span></li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bunari journal export</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: #f8f2e9; color: #2b2118; line-height: 1.55; margin: 0 auto; max-width: 760px; padding: 48px 24px 80px; }
    header { border-bottom: 2px solid #d9b98f; margin-bottom: 32px; padding-bottom: 20px; }
    h1, h2 { line-height: 1.2; }
    h1 { font-size: 34px; margin: 0 0 8px; }
    h2 { font-size: 24px; margin: 5px 0 8px; }
    article { background: #fffdf9; border: 1px solid #e5d8c7; border-radius: 16px; margin: 0 0 22px; padding: 24px; break-inside: avoid; }
    .date, .description, .photos, header p, .trips span { color: #766655; }
    .date { font-size: 13px; margin: 0; text-transform: uppercase; }
    .description { margin-top: 0; }
    .metadata { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0; }
    .metadata span { background: #f1e5d5; border-radius: 999px; font-size: 12px; padding: 4px 9px; }
    .body { margin-top: 18px; white-space: normal; }
    .todos { list-style: none; padding: 0; }
    .todos small { color: #8b6036; }
    .photos { font-size: 13px; margin-bottom: 0; }
    .trips { background: #fffdf9; border: 1px solid #e5d8c7; border-radius: 16px; padding: 18px 18px 18px 38px; }
    .trips li { margin: 8px 0; }
    @media print { body { background: white; max-width: none; padding: 20px; } article, .trips { box-shadow: none; } }
  </style>
</head>
<body>
  <header><h1>Bunari Journal</h1><p>Exported ${escapeHtml(readableDate(new Date().toISOString()))} · ${publicEntries.length} ${publicEntries.length === 1 ? 'entry' : 'entries'}</p></header>
  ${trips.length > 0 ? `<section><h2>Trips</h2><ul class="trips">${tripMarkup}</ul></section>` : ''}
  <main>${entryMarkup || '<p>No journal entries to export.</p>'}</main>
</body>
</html>`;
}
