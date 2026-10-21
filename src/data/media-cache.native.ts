// Native photo cache: local files, uploads to Supabase Storage, and Private data URIs
import { Directory, File, Paths } from 'expo-file-system';

import type { LocalCopy } from '@/domain/media-cleanup';

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('heif')) return 'heif';
  return 'jpg';
}

// Only files in the app's cache folder (picker and camera copies) are ever deleted.
function isTemporaryFile(uri: string) {
  const path = (value: string) =>
    decodeURI(value)
      .replace(/^file:\/\//, '')
      .replace(/^\/private(?=\/var\/)/, '');
  try {
    return uri.startsWith('file://') && path(uri).startsWith(path(Paths.cache.uri));
  } catch {
    return false;
  }
}

function userDirectory(userId: string) {
  const root = new Directory(Paths.document, 'journal-media');
  root.create({ idempotent: true, intermediates: true });
  const directory = new Directory(root, safePart(userId));
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

export const mediaCache = {
  async cacheRemote(userId: string, storagePath: string, signedUrl: string) {
    const extension = storagePath.split('.').pop() || 'jpg';
    const destination = new File(userDirectory(userId), `${safePart(storagePath)}.${extension}`);
    if (!destination.exists) await File.downloadFileAsync(signedUrl, destination, { idempotent: true });
    return destination.uri;
  },
  async clearUser(userId: string) {
    const directory = userDirectory(userId);
    if (directory.exists) directory.delete();
  },
  async deleteCopies(uris: string[]) {
    for (const uri of uris) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        /* Left for the next clear. */
      }
    }
  },
  hasLocalCopy(uri: string) {
    if (!uri.startsWith('file://')) return true;
    try {
      return new File(uri).exists;
    } catch {
      return true;
    }
  },
  async localCopies(userId: string): Promise<LocalCopy[]> {
    return userDirectory(userId)
      .list()
      .filter((item): item is File => item instanceof File)
      .map((file) => ({ name: file.name, size: file.size ?? 0, uri: file.uri }));
  },
  async persistPicked(userId: string, sourceUri: string, mediaId: string, mimeType: string) {
    const destination = new File(userDirectory(userId), `${safePart(mediaId)}.${extensionFor(mimeType)}`);
    await new File(sourceUri).copy(destination, { overwrite: true });
    return { mimeType, uri: destination.uri };
  },
  // Reads a photo into a data URI that is then encrypted with the Private entry. The
  // temporary picker or camera copy is deleted, so no unencrypted copy stays behind.
  async privateDataUri(sourceUri: string, mimeType: string) {
    const file = new File(sourceUri);
    const encoded = await file.base64();
    if (isTemporaryFile(sourceUri)) {
      try {
        file.delete();
      } catch {
        /* The system clears its cache folder later. */
      }
    }
    return `data:${mimeType};base64,${encoded}`;
  },
  read(sourceUri: string) {
    return new File(sourceUri).arrayBuffer();
  },
};
