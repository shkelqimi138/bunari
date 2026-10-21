// Which downloaded photo copies "Clear unused photo copies" in Account removes
export type LocalCopy = { name: string; size: number; uri: string };

// A copy downloaded from the account: its file name comes from the photo's storage path
// (".../entries/..."). Photos picked or taken on this device are named by their id instead, and are
// never cleared: one may not be uploaded yet.
export function isDownloadedCopy(fileName: string) {
  return fileName.includes('_entries_');
}

function fileNameOf(uri: string) {
  const name = uri.split('?')[0]?.split('/').pop() ?? '';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

// Downloaded copies that no entry on this device shows anymore (a deleted note's photos, a replaced
// cover), so removing them changes nothing on screen.
export function unusedDownloadedCopies(copies: LocalCopy[], usedUris: Iterable<string | null | undefined>) {
  const used = new Set<string>();
  for (const uri of usedUris) if (uri) used.add(fileNameOf(uri));
  return copies.filter((copy) => isDownloadedCopy(copy.name) && !used.has(copy.name));
}

// "4.2 MB", for the confirmation.
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
