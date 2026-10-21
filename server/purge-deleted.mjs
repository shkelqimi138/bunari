// Deletes entries that have been in Recently Deleted for more than 30 days, with their photos
import { adminHeaders } from './account-admin.mjs';

// Must match recentlyDeletedDays in src/domain/recently-deleted.ts, which the app shows and enforces.
export const recentlyDeletedDays = 30;
const dayMs = 24 * 60 * 60 * 1000;
// 100 ids keep each request address well under gateway length limits.
const batchSize = 100;
// Bounds one run; anything left over is picked up by the next run.
const maxBatchesPerRun = 25;

export function createDeletedEntryPurge({
  fetchImpl = fetch,
  now = () => Date.now(),
  supabaseServiceRoleKey,
  supabaseUrl,
}) {
  if (!supabaseServiceRoleKey) return null;

  async function request(path, init = {}) {
    const response = await fetchImpl(`${supabaseUrl}${path}`, {
      ...init,
      headers: { ...adminHeaders(supabaseServiceRoleKey), ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
    // Only the status is reported: responses can hold journal content.
    if (!response.ok) throw new Error(`Supabase cleanup request failed with ${response.status}.`);
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    // Returns how many entries were deleted for good.
    async run() {
      const cutoff = encodeURIComponent(new Date(now() - recentlyDeletedDays * dayMs).toISOString());
      let purged = 0;

      for (let batch = 0; batch < maxBatchesPerRun; batch += 1) {
        const expired = await request(
          `/rest/v1/entries?select=id,user_id&deleted_at=lt.${cutoff}&order=deleted_at.asc&limit=${batchSize}`,
        );
        if (expired.length === 0) break;
        const ids = `in.(${expired.map((row) => row.id).join(',')})`;
        const owners = new Map(expired.map((row) => [row.id, row.user_id]));
        const media = await request(`/rest/v1/entry_media?select=entry_id,storage_path&entry_id=${ids}`);

        // Photos go first: if removing them fails, nothing is deleted and the next run tries again,
        // so no file is left behind without its entry. Only files inside the owner's own folder are
        // removed. The app no longer restores an entry once its 30 days are over, so an expired entry
        // does not come back without its photos.
        const paths = media
          .filter((item) => owners.has(item.entry_id) && item.storage_path.startsWith(`${owners.get(item.entry_id)}/`))
          .map((item) => item.storage_path);
        for (let offset = 0; offset < paths.length; offset += 100) {
          await request('/storage/v1/object/journal-media', {
            body: JSON.stringify({ prefixes: paths.slice(offset, offset + 100) }),
            method: 'DELETE',
          });
        }

        // The deleted_at filter is repeated, so an entry restored meanwhile is left alone.
        const deleted = await request(
          `/rest/v1/entries?id=${ids}&deleted_at=lt.${cutoff}&select=id,user_id,sync_version`,
          {
            headers: { prefer: 'return=representation' },
            method: 'DELETE',
          },
        );

        if (deleted.length > 0) {
          // Tells the user's other devices the entry is gone.
          await request('/rest/v1/sync_tombstones?on_conflict=user_id,entity_type,entity_id', {
            body: JSON.stringify(
              deleted.map((row) => ({
                entity_id: row.id,
                entity_type: 'entry',
                sync_version: Number(row.sync_version) + 1,
                user_id: row.user_id,
              })),
            ),
            headers: { prefer: 'resolution=merge-duplicates' },
            method: 'POST',
          });
        }

        purged += deleted.length;
        if (expired.length < batchSize) break;
      }

      return { purged };
    },
  };
}

// Runs the purge shortly after start and then every 6 hours. Runs never overlap, and the
// timers do not keep the process alive on shutdown.
export function schedulePurge(purge, { intervalMs = 6 * 60 * 60 * 1000, log = console, startDelayMs = 60_000 } = {}) {
  if (!purge) return null;
  let running = false;
  const runOnce = async () => {
    if (running) return;
    running = true;
    try {
      const { purged } = await purge.run();
      if (purged > 0) log.log(`Recently Deleted cleanup removed ${purged} ${purged === 1 ? 'entry' : 'entries'}.`);
    } catch (error) {
      log.error(`Recently Deleted cleanup failed. ${error instanceof Error ? error.message : 'Unknown error.'}`);
    } finally {
      running = false;
    }
  };
  const start = setTimeout(runOnce, startDelayMs);
  const interval = setInterval(runOnce, intervalMs);
  start.unref?.();
  interval.unref?.();
  return {
    runOnce,
    stop: () => {
      clearTimeout(start);
      clearInterval(interval);
    },
  };
}
