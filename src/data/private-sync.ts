// Encrypted Private journal record storage and sync with Supabase
import { randomUUID } from 'expo-crypto';

import { readLocalJson, writeLocalJson } from '@/data/local-store';
import { syncErrorMessage } from '@/data/sync-error';
import { storageLimitMessage } from '@/domain/storage-limits';
import { supabase } from '@/lib/supabase';
import type { SealedValue } from '@/security/private-crypto';
import { normalizeCiphertext } from '@/security/sealed-value';

export type EncryptedPrivateEntry = SealedValue & {
  createdAt: string;
  // When the entry was moved to Recently Deleted; stored unencrypted, like its other dates.
  deletedAt?: string | null;
  id: string;
  syncVersion: number;
  updatedAt: string;
};

export type PrivateMutation =
  | { baseVersion: number; kind: 'upsert'; mutationId: string; record: EncryptedPrivateEntry }
  | { baseVersion: number; entryId: string; kind: 'delete'; mutationId: string };

export type PrivateSyncIssue = {
  createdAt: string;
  id: string;
  kind: 'conflict' | 'error';
  message: string;
};

export type PersistedPrivateJournal = {
  // Sync results only: the version each record was written at by this device
  // during the sync, so edits made meanwhile can build on it.
  acknowledged?: Record<string, number>;
  pending: PrivateMutation[];
  records: EncryptedPrivateEntry[];
  syncIssues?: PrivateSyncIssue[];
  version: 1;
};

type PrivateEntryRow = {
  deleted_at?: string | null;
  entry_date: string;
  id: string;
  private_payload_ciphertext: string;
  private_payload_nonce: string;
  private_payload_version: 1;
  sync_version: number;
  updated_at: string;
};

const emptyPrivateJournal: PersistedPrivateJournal = { pending: [], records: [], version: 1 };

export function privateStorageKey(userId: string) {
  return `private-journal.v1.${userId}`;
}

export async function loadPrivateJournal(userId: string) {
  return (await readLocalJson<PersistedPrivateJournal>(privateStorageKey(userId))) ?? emptyPrivateJournal;
}

export function savePrivateJournal(userId: string, value: PersistedPrivateJournal) {
  return writeLocalJson(privateStorageKey(userId), value);
}

export function mergePrivateMutation(current: PrivateMutation[], next: PrivateMutation) {
  const nextId = next.kind === 'upsert' ? next.record.id : next.entryId;
  const index = current.findIndex(
    (mutation) => (mutation.kind === 'upsert' ? mutation.record.id : mutation.entryId) === nextId,
  );
  if (index < 0) return [...current, next];
  const existing = current[index]!;
  const replacement = { ...next, baseVersion: existing.baseVersion } as PrivateMutation;
  return current.map((mutation, mutationIndex) => (mutationIndex === index ? replacement : mutation));
}

// Removes records for good and queues their deletion on the server; a record that never reached the
// server only has its queued upload dropped. Needs no key, so it also works while Private is locked.
// Returns the same journal when none of the records is known.
export function removePrivateRecords(
  journal: PersistedPrivateJournal,
  records: { id: string; syncVersion?: number }[],
): PersistedPrivateJournal {
  const ids = new Set(records.map((record) => record.id));
  if (!journal.records.some((record) => ids.has(record.id))) return journal;
  let pending = journal.pending;
  for (const { id, syncVersion } of records) {
    const unsynced = pending.some(
      (mutation) => mutation.kind === 'upsert' && mutation.record.id === id && mutation.baseVersion === 0,
    );
    pending = unsynced
      ? pending.filter((mutation) => (mutation.kind === 'delete' ? mutation.entryId !== id : mutation.record.id !== id))
      : mergePrivateMutation(pending, {
          baseVersion: syncVersion ?? 0,
          entryId: id,
          kind: 'delete',
          mutationId: randomUUID(),
        });
  }
  return { ...journal, pending, records: journal.records.filter((record) => !ids.has(record.id)) };
}

export function reconcilePrivateSync(
  current: PersistedPrivateJournal,
  snapshot: PersistedPrivateJournal,
  result: PersistedPrivateJournal,
) {
  const snapshotIds = new Set(snapshot.pending.map((mutation) => mutation.mutationId));
  const newer = current.pending.filter((mutation) => !snapshotIds.has(mutation.mutationId));
  const resultRecords = new Map(result.records.map((record) => [record.id, record]));
  const records = [...result.records];
  let pending = [...result.pending];

  for (const original of newer) {
    let mutation = original;
    const entryId = mutation.kind === 'upsert' ? mutation.record.id : mutation.entryId;
    const remoteVersion = resultRecords.get(entryId)?.syncVersion;
    // An edit made while this device's own write of the same entry was in flight
    // still carries the pre-sync version; rebase it instead of reporting a conflict.
    const written = result.acknowledged?.[entryId];
    if (written !== undefined && mutation.baseVersion < written) {
      mutation =
        mutation.kind === 'upsert'
          ? { ...mutation, baseVersion: written, record: { ...mutation.record, syncVersion: written } }
          : { ...mutation, baseVersion: written };
    } else if (mutation.baseVersion === 0 && remoteVersion) {
      mutation =
        mutation.kind === 'upsert'
          ? { ...mutation, baseVersion: remoteVersion, record: { ...mutation.record, syncVersion: remoteVersion } }
          : { ...mutation, baseVersion: remoteVersion };
    }
    pending = mergePrivateMutation(pending, mutation);

    const index = records.findIndex((record) => record.id === entryId);
    if (mutation.kind === 'delete') {
      if (index >= 0) records.splice(index, 1);
    } else {
      const localRecord = current.records.find((record) => record.id === entryId) ?? mutation.record;
      const nextRecord = { ...localRecord, syncVersion: mutation.baseVersion };
      if (index < 0) records.push(nextRecord);
      else records[index] = nextRecord;
    }
  }

  return {
    pending,
    records,
    syncIssues: result.syncIssues ?? current.syncIssues ?? [],
    version: 1,
  } satisfies PersistedPrivateJournal;
}

function recordFromRow(row: PrivateEntryRow): EncryptedPrivateEntry {
  return {
    ciphertext: row.private_payload_ciphertext,
    createdAt: row.entry_date,
    deletedAt: row.deleted_at ?? null,
    id: row.id,
    nonce: row.private_payload_nonce,
    syncVersion: row.sync_version,
    updatedAt: row.updated_at,
    version: row.private_payload_version,
  };
}

async function pullPrivateJournal(userId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      'id,entry_date,deleted_at,updated_at,sync_version,private_payload_ciphertext,private_payload_nonce,private_payload_version',
    )
    .eq('user_id', userId)
    .eq('is_private', true);
  if (error) throw error;
  return (data as PrivateEntryRow[]).map(recordFromRow);
}

async function privateSectionId(userId: string) {
  const { data, error } = await supabase
    .from('journal_sections')
    .select('id')
    .eq('user_id', userId)
    .eq('built_in_key', 'private')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function synchronizePrivateJournal(userId: string, local: PersistedPrivateJournal) {
  const sectionId = await privateSectionId(userId);
  let records = [...local.records];
  const remaining: PrivateMutation[] = [];
  const acknowledged: Record<string, number> = {};
  const syncIssues = (local.syncIssues ?? []).filter((issue) => issue.kind !== 'error');
  const initialRemote = await pullPrivateJournal(userId);
  const remoteVersions = new Map(initialRemote.map((record) => [record.id, record.syncVersion]));

  for (let index = 0; index < local.pending.length; index += 1) {
    const mutation = local.pending[index]!;
    try {
      if (mutation.kind === 'upsert') {
        const payload = {
          deleted_at: mutation.record.deletedAt ?? null,
          entry_date: mutation.record.createdAt,
          id: mutation.record.id,
          is_private: true,
          // Records sealed by builds 7–11 may still hold their bytes as an object.
          private_payload_ciphertext: normalizeCiphertext(mutation.record.ciphertext) ?? mutation.record.ciphertext,
          private_payload_nonce: mutation.record.nonce,
          private_payload_version: mutation.record.version,
          section_id: sectionId,
          user_id: userId,
        };
        const expectedVersion =
          mutation.baseVersion > 0 ? mutation.baseVersion : (remoteVersions.get(mutation.record.id) ?? 0);
        const query =
          expectedVersion > 0
            ? supabase.from('entries').update(payload).eq('id', mutation.record.id).eq('sync_version', expectedVersion)
            : supabase.from('entries').insert(payload);
        const { data, error } = await query.select('sync_version,updated_at').maybeSingle();
        if (error) throw error;

        if (!data && expectedVersion > 0 && mutation.record.deletedAt) {
          // Moving to Recently Deleted an entry already deleted for good elsewhere (or by the 30-day
          // cleanup) leaves nothing to keep; one that still exists becomes a conflict copy below.
          const { data: existing, error: existsError } = await supabase
            .from('entries')
            .select('id')
            .eq('id', mutation.record.id)
            .maybeSingle();
          if (existsError) throw existsError;
          if (!existing) {
            records = records.filter((record) => record.id !== mutation.record.id);
            continue;
          }
        }

        if (!data && expectedVersion > 0) {
          const conflictRecord = { ...mutation.record, id: randomUUID(), syncVersion: 0 };
          const { data: conflict, error: conflictError } = await supabase
            .from('entries')
            .insert({
              ...payload,
              id: conflictRecord.id,
            })
            .select('sync_version,updated_at')
            .single();
          if (conflictError) throw conflictError;
          records = records
            .filter((record) => record.id !== mutation.record.id)
            .concat({
              ...conflictRecord,
              syncVersion: conflict.sync_version,
              updatedAt: conflict.updated_at,
            });
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: 'A Private entry changed elsewhere. Both encrypted versions were kept.',
          });
        } else if (data) {
          acknowledged[mutation.record.id] = data.sync_version;
          records = records.map((record) =>
            record.id === mutation.record.id
              ? { ...record, syncVersion: data.sync_version, updatedAt: data.updated_at }
              : record,
          );
        }
      } else {
        const { data: remote, error: readError } = await supabase
          .from('entries')
          .select('sync_version')
          .eq('id', mutation.entryId)
          .maybeSingle();
        if (readError) throw readError;
        if (remote && mutation.baseVersion > 0 && remote.sync_version !== mutation.baseVersion) {
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: 'A Private entry changed elsewhere, so its offline deletion was not applied.',
          });
          continue;
        }
        const { error } = await supabase.from('entries').delete().eq('id', mutation.entryId);
        if (error) throw error;
        const { error: tombstoneError } = await supabase.from('sync_tombstones').upsert(
          {
            entity_id: mutation.entryId,
            entity_type: 'entry',
            sync_version: Math.max(1, mutation.baseVersion + 1),
            user_id: userId,
          },
          { onConflict: 'user_id,entity_type,entity_id' },
        );
        if (tombstoneError) throw tombstoneError;
      }
    } catch (error) {
      syncIssues.push({
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        kind: 'error',
        message: `An encrypted Private change could not sync. ${storageLimitMessage(error) ?? syncErrorMessage(error)} It remains safely on this device.`,
      });
      remaining.push(mutation);
    }
  }

  const remote = await pullPrivateJournal(userId);
  const pendingIds = new Set(
    remaining.map((mutation) => (mutation.kind === 'upsert' ? mutation.record.id : mutation.entryId)),
  );
  return {
    acknowledged,
    pending: remaining,
    records: remote
      .filter((record) => !pendingIds.has(record.id))
      .concat(records.filter((record) => pendingIds.has(record.id))),
    syncIssues,
    version: 1,
  } satisfies PersistedPrivateJournal;
}
