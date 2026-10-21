// Platform-neutral type declaration for the photo cache
import type { LocalCopy } from '@/domain/media-cleanup';

export type CachedMedia = { mimeType: string; uri: string };

export declare const mediaCache: {
  cacheRemote(userId: string, storagePath: string, signedUrl: string): Promise<string>;
  clearUser(userId: string): Promise<void>;
  // Removes these files from this device; files that are already gone are skipped.
  deleteCopies(uris: string[]): Promise<void>;
  // Every photo file kept for this user on this device (downloaded and picked).
  localCopies(userId: string): Promise<LocalCopy[]>;
  // False only for a file on this device that no longer exists, so it is downloaded again.
  hasLocalCopy(uri: string): boolean;
  persistPicked(userId: string, sourceUri: string, mediaId: string, mimeType: string): Promise<CachedMedia>;
  privateDataUri(sourceUri: string, mimeType: string): Promise<string>;
  read(sourceUri: string): Promise<ArrayBuffer>;
};
