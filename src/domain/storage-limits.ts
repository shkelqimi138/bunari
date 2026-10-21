// Storage limits per account (security audit, 2026-10-08; limits chosen by the user), enforced by
// Supabase (`supabase/migrations/20261008142031_account_storage_limits.sql`, which must match): at a
// limit, new photos and growing saves are refused, while deleting always works. The refused change
// stays queued on the device, and its sync issue says why.
export const photoLimitCount = 500;
export const photoLimitMegabytes = 250;
export const dataLimitMegabytes = 50;

const limitReached = 'Storage limit reached:';
// Written by the database itself when saving notes and other journal data would pass the limit.
export const dataLimitMessage = `${limitReached} an account can keep up to ${dataLimitMegabytes} MB of notes and other journal data. Delete notes you no longer need, then delete them for good in Recently Deleted.`;
// Storage refuses a photo past the limit only with its general "row-level security" answer.
export const photoLimitMessage = `${limitReached} an account can keep up to ${photoLimitCount} photos or ${photoLimitMegabytes} MB of photos. Remove photos or delete notes you no longer need, then delete them for good in Recently Deleted.`;

// Whether a sync problem is a storage limit. Then the app stops retrying by itself every few seconds,
// which would send the same photo (up to 15 MB) again and again only to be refused; Retry and
// reopening the app still try again (code review, 2026-10-08).
export function hasStorageLimitIssue(issues: readonly { message: string }[]) {
  return issues.some((issue) => issue.message.includes(limitReached));
}

// The readable message for an error caused by a storage limit, or null for any other error.
export function storageLimitMessage(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const { message, name } = error as { message?: unknown; name?: unknown };
  if (typeof message !== 'string') return null;
  if (message.startsWith(limitReached)) return message;
  // Bunari uploads only into the account's own folder, so Storage refuses an upload there only
  // because of the photo limit.
  if (name === 'StorageApiError' && /row-level security/i.test(message)) return photoLimitMessage;
  return null;
}
