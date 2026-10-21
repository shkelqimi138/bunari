// Shares one note as a styled PDF (opens in Notes, Files, Word, Mail) or as plain text
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import type { JournalEntry } from '@/domain/journal';
import { supabase } from '@/lib/supabase';
import type { darkPalette } from '@/theme/tokens';
import { noteHtml, noteText } from './note-html';

type Palette = { [Key in keyof typeof darkPalette]: string };

// Copies made while building the PDF (downloads, resized photos, the PDF itself); they hold note
// content, so they are deleted once the share sheet closes instead of staying in the cache.
function removeFiles(uris: string[]) {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      /* The system clears its cache folder later. */
    }
  }
}

// Downloads a synced photo; an expired link is replaced with a fresh one from storage.
async function downloadRemote(uri: string, storagePath: string | null | undefined, temporary: string[]) {
  const target = new File(Paths.cache, `pdf-photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  temporary.push(target.uri);
  try {
    return (await File.downloadFileAsync(uri, target, { idempotent: true })).uri;
  } catch (caught) {
    if (!storagePath) throw caught;
    const { data, error } = await supabase.storage.from('journal-media').createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) throw caught;
    return (await File.downloadFileAsync(data.signedUrl, target, { idempotent: true })).uri;
  }
}

// A full-size original larger than this is left out; it could make the PDF too big to print.
const maxOriginalBytes = 8 * 1024 * 1024;

// Photos are embedded in the page so the PDF shows them without the app. Each is scaled down so
// the PDF stays small; if that fails, the original photo is used rather than leaving it out.
async function embeddedImage(
  uri: string,
  storagePath: string | null | undefined,
  mimeType: string | null | undefined,
  temporary: string[],
) {
  const source = /^https:\/\//i.test(uri) ? await downloadRemote(uri, storagePath, temporary) : uri;
  if (source.startsWith('data:')) return source;
  try {
    const rendered = await ImageManipulator.manipulate(source).resize({ width: 1200 }).renderAsync();
    const saved = await rendered.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
    temporary.push(saved.uri);
    if (saved.base64) return `data:image/jpeg;base64,${saved.base64}`;
  } catch {
    /* Falls back to the original file below. */
  }
  const original = new File(source);
  if (!original.exists || (original.size ?? 0) > maxOriginalBytes) throw new Error('Photo unavailable');
  return `data:${mimeType || 'image/jpeg'};base64,${await original.base64()}`;
}

// Tries each known copy of a photo (the one on screen, then the saved entry's), then a fresh
// download from storage; a photo that cannot be read at all is left out rather than failing the share.
async function firstEmbeddedImage(
  uris: (string | null | undefined)[],
  storagePath: string | null | undefined,
  mimeType: string | null | undefined,
  temporary: string[],
) {
  for (const uri of new Set(uris.filter((value): value is string => Boolean(value)))) {
    try {
      return await embeddedImage(uri, storagePath, mimeType, temporary);
    } catch {
      /* Try the next copy. */
    }
  }
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from('journal-media').createSignedUrl(storagePath, 300);
    return error || !data?.signedUrl ? null : await embeddedImage(data.signedUrl, null, mimeType, temporary);
  } catch {
    return null;
  }
}

function fileName(title: string) {
  const clean = title
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${clean || 'Bunari note'}.pdf`;
}

// `entry` is the note as shown on screen, which may be newer than `saved`, the stored copy
// whose photo files are tried when the on-screen ones cannot be read.
export async function shareNoteAsPdf(
  entry: JournalEntry,
  options: { folderName?: string | null; palette: Palette; saved?: JournalEntry },
) {
  const temporary: string[] = [];
  try {
    if (!(await Sharing.isAvailableAsync())) return { error: 'Sharing is unavailable on this device.' };
    const saved = options.saved ?? entry;
    const sameCover = saved.coverMediaId === entry.coverMediaId;
    // One photo at a time keeps memory low while the editor stays open.
    const cover = entry.coverUri
      ? await firstEmbeddedImage(
          [entry.coverUri, sameCover ? saved.coverUri : null],
          entry.coverStoragePath ?? (sameCover ? saved.coverStoragePath : null),
          entry.coverMimeType,
          temporary,
        )
      : null;
    const photos: string[] = [];
    for (const attachment of entry.attachments) {
      const stored = saved.attachments.find((candidate) => candidate.id === attachment.id);
      const photo = await firstEmbeddedImage(
        [attachment.uri, stored?.uri],
        attachment.storagePath ?? stored?.storagePath,
        attachment.mimeType,
        temporary,
      );
      if (photo) photos.push(photo);
    }
    const html = noteHtml(entry, {
      folderName: options.folderName,
      images: { cover, photos },
      palette: options.palette,
    });
    const printed = await Print.printToFileAsync({ html, margins: { bottom: 0, left: 0, right: 0, top: 0 } });
    temporary.push(printed.uri);
    const pdf = new File(Paths.cache, fileName(entry.title));
    if (pdf.exists) pdf.delete();
    new File(printed.uri).moveSync(pdf);
    temporary.push(pdf.uri);
    await Sharing.shareAsync(pdf.uri, {
      dialogTitle: entry.title || 'Share note',
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
    return { error: null };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : 'The note could not be shared.' };
  } finally {
    removeFiles(temporary);
  }
}

export async function shareNoteAsText(entry: JournalEntry) {
  await Share.share({ message: noteText(entry), title: entry.title });
}
