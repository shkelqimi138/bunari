// Offline-first journal sync with Supabase: mutation queue, reconciliation, and conflict copies
import { randomUUID } from 'expo-crypto';

import { mediaCache } from '@/data/media-cache';
import { syncErrorMessage } from '@/data/sync-error';
import { storageLimitMessage } from '@/domain/storage-limits';
import {
  defaultFolders,
  folderFromRow,
  notesFolderId,
  privateFolderId,
  retiredSectionKeys,
  sortFolders,
  tripContainingDate,
  type JournalEntry,
  type JournalFolder,
  type JournalSectionId,
  type TodoItem,
  type Trip,
} from '@/domain/journal';
import { supabase } from '@/lib/supabase';

export type JournalMutation =
  | { baseVersion: number; entry: JournalEntry; entityId: string; kind: 'entry-upsert'; mutationId: string }
  | { baseVersion: number; entityId: string; kind: 'entry-delete'; mutationId: string }
  | { baseVersion: number; entityId: string; kind: 'trip-upsert'; mutationId: string; trip: Trip }
  | { baseVersion: number; entityId: string; kind: 'trip-delete'; mutationId: string }
  | { collapsed: boolean; entityId: JournalSectionId; kind: 'section-update'; mutationId: string }
  | {
      entityId: JournalSectionId;
      folder: { emoji: string; name: string; position: number };
      kind: 'folder-create';
      mutationId: string;
    }
  | { entityId: JournalSectionId; kind: 'folder-delete'; mutationId: string };

export type SyncIssue = {
  createdAt: string;
  id: string;
  kind: 'conflict' | 'error';
  message: string;
};

export type PersistedJournal = {
  // Sync results only: the version each entry or trip was written at by this
  // device during the sync, so edits made meanwhile can build on it.
  acknowledged?: Record<string, number>;
  entries: JournalEntry[];
  expandedSectionIds: JournalSectionId[];
  folders?: JournalFolder[];
  pending: JournalMutation[];
  syncIssues?: SyncIssue[];
  trips: Trip[];
  version: 1;
};

type SectionRow = {
  built_in_key: string | null;
  collapsed: boolean;
  emoji: string;
  id: string;
  name: string;
  position: number;
};

const sectionColumns = 'id,built_in_key,collapsed,name,emoji,position';

// The key a folder is addressed by in the app: its built-in key or its row id.
function sectionKey(section: SectionRow) {
  return section.built_in_key ?? section.id;
}

function isRetired(section: SectionRow) {
  return Boolean(section.built_in_key && retiredSectionKeys.includes(section.built_in_key));
}

type TodoRow = {
  completed: boolean;
  due_tag: string | null;
  id: string;
  position: number;
  text: string;
};

type EntryRow = {
  body: JournalEntry['body'];
  deleted_at?: string | null;
  description: string | null;
  entry_date: string;
  favorite: boolean;
  id: string;
  latitude: number | null;
  location_label: string | null;
  longitude: number | null;
  mood: JournalEntry['mood'];
  mood_suggestion?: JournalEntry['moodSuggestion'];
  plain_text: string | null;
  reviewed: boolean;
  section_id: string;
  sync_version: number;
  title: string | null;
  todo_items?: TodoRow[];
  trip_id: string | null;
  updated_at: string;
};

type MediaRow = {
  captured_at: string | null;
  entry_id: string;
  id: string;
  is_cover: boolean;
  mime_type: string;
  sort_order: number;
  storage_path: string;
};

type TripRow = {
  destination: string;
  emoji: string;
  end_date: string;
  id: string;
  start_date: string;
  sync_version: number;
  updated_at: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mutationLabel(mutation: JournalMutation) {
  if (mutation.kind.startsWith('entry-')) return 'journal entry';
  if (mutation.kind.startsWith('trip-')) return 'trip';
  if (mutation.kind.startsWith('folder-')) return 'folder';
  return 'journal section';
}

function normalizeEntryMedia(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    attachments: entry.attachments.map((attachment) =>
      uuidPattern.test(attachment.id) ? attachment : { ...attachment, id: randomUUID(), storagePath: null },
    ),
    coverMediaId: entry.coverUri
      ? entry.coverMediaId && uuidPattern.test(entry.coverMediaId)
        ? entry.coverMediaId
        : randomUUID()
      : null,
    coverMimeType: entry.coverUri ? (entry.coverMimeType ?? 'image/jpeg') : null,
    coverStoragePath: entry.coverUri ? (entry.coverStoragePath ?? null) : null,
  };
}

export function journalStorageKey(userId: string) {
  return `journal-data.v1.${userId}`;
}

export function mergeJournalMutation(current: JournalMutation[], next: JournalMutation) {
  const index = current.findIndex(
    (mutation) => mutation.entityId === next.entityId && mutation.kind.split('-')[0] === next.kind.split('-')[0],
  );
  if (index < 0) return [...current, next];

  const existing = current[index]!;
  const replacement =
    'baseVersion' in existing && 'baseVersion' in next
      ? ({ ...next, baseVersion: existing.baseVersion } as JournalMutation)
      : next;
  return current.map((mutation, mutationIndex) => (mutationIndex === index ? replacement : mutation));
}

// Queues entries for permanent deletion (Delete now, Delete all, the 30-day cleanup). An entry that
// never reached the server only has its queued upload dropped. Returns the same state when none of
// the ids is known.
export function queuePermanentDeletes(state: PersistedJournal, entryIds: string[]): PersistedJournal {
  const ids = new Set(entryIds);
  const removed = state.entries.filter((entry) => ids.has(entry.id));
  if (removed.length === 0) return state;
  let pending = state.pending;
  for (const entry of removed) {
    const unsyncedCreate = pending.some(
      (mutation) => mutation.kind === 'entry-upsert' && mutation.entityId === entry.id && mutation.baseVersion === 0,
    );
    pending = unsyncedCreate
      ? pending.filter((mutation) => mutation.entityId !== entry.id)
      : mergeJournalMutation(pending, {
          baseVersion: entry.syncVersion ?? 0,
          entityId: entry.id,
          kind: 'entry-delete',
          mutationId: randomUUID(),
        });
  }
  return { ...state, entries: state.entries.filter((entry) => !ids.has(entry.id)), pending };
}

export function normalizeJournalMutations(mutations: JournalMutation[]) {
  return mutations.map((mutation) =>
    mutation.mutationId ? mutation : ({ ...mutation, mutationId: randomUUID() } as JournalMutation),
  );
}

export function reconcileJournalSync(
  current: PersistedJournal,
  snapshot: PersistedJournal,
  result: PersistedJournal,
): PersistedJournal {
  const snapshotIds = new Set(snapshot.pending.map((mutation) => mutation.mutationId));
  const newer = current.pending.filter((mutation) => !snapshotIds.has(mutation.mutationId));
  let pending = [...result.pending];

  const resultEntries = new Map(result.entries.map((entry) => [entry.id, entry]));
  const resultTrips = new Map(result.trips.map((trip) => [trip.id, trip]));
  const entries = [...result.entries];
  const trips = [...result.trips];

  for (const original of newer) {
    let mutation = original;
    // An edit made while this device's own write of the same entity was in flight
    // still carries the pre-sync version; rebase it instead of reporting a conflict.
    const written = 'baseVersion' in mutation ? result.acknowledged?.[mutation.entityId] : undefined;
    if ('baseVersion' in mutation && written !== undefined && mutation.baseVersion < written) {
      mutation = { ...mutation, baseVersion: written } as JournalMutation;
    } else if ('baseVersion' in mutation && mutation.baseVersion === 0) {
      const remoteVersion = mutation.kind.startsWith('entry-')
        ? resultEntries.get(mutation.entityId)?.syncVersion
        : resultTrips.get(mutation.entityId)?.syncVersion;
      if (remoteVersion) mutation = { ...mutation, baseVersion: remoteVersion } as JournalMutation;
    }
    pending = mergeJournalMutation(pending, mutation);

    if (mutation.kind === 'entry-upsert') {
      const index = entries.findIndex((entry) => entry.id === mutation.entityId);
      const localEntry = current.entries.find((entry) => entry.id === mutation.entityId) ?? mutation.entry;
      const nextEntry = { ...localEntry, syncVersion: mutation.baseVersion };
      if (index < 0) entries.push(nextEntry);
      else entries[index] = nextEntry;
    } else if (mutation.kind === 'entry-delete') {
      const index = entries.findIndex((entry) => entry.id === mutation.entityId);
      if (index >= 0) entries.splice(index, 1);
    } else if (mutation.kind === 'trip-upsert') {
      const index = trips.findIndex((trip) => trip.id === mutation.entityId);
      const localTrip = current.trips.find((trip) => trip.id === mutation.entityId) ?? mutation.trip;
      const nextTrip = { ...localTrip, syncVersion: mutation.baseVersion };
      if (index < 0) trips.push(nextTrip);
      else trips[index] = nextTrip;
    } else if (mutation.kind === 'trip-delete') {
      const index = trips.findIndex((trip) => trip.id === mutation.entityId);
      if (index >= 0) trips.splice(index, 1);
    }
  }

  let folders = result.folders ?? current.folders;
  for (const mutation of newer) {
    if (mutation.kind === 'folder-create') {
      const created = current.folders?.find((folder) => folder.id === mutation.entityId);
      if (created) folders = [...(folders ?? []).filter((folder) => folder.id !== created.id), created];
    } else if (mutation.kind === 'folder-delete') {
      folders = folders?.filter((folder) => folder.id !== mutation.entityId);
    }
  }

  return {
    entries,
    expandedSectionIds: newer.some((mutation) => mutation.kind === 'section-update')
      ? current.expandedSectionIds
      : result.expandedSectionIds,
    folders: folders && sortFolders(folders),
    pending,
    syncIssues: result.syncIssues ?? current.syncIssues ?? [],
    trips,
    version: 1,
  };
}

async function cachedMediaUri(userId: string, row: MediaRow, localUri?: string): Promise<string | null> {
  // A copy cleared from this device (Account › Clear unused photo copies) is downloaded again.
  if (localUri && mediaCache.hasLocalCopy(localUri)) return localUri;
  const { data, error } = await supabase.storage.from('journal-media').createSignedUrl(row.storage_path, 3600);
  if (error || !data?.signedUrl) return null;
  try {
    return await mediaCache.cacheRemote(userId, row.storage_path, data.signedUrl);
  } catch {
    return data.signedUrl;
  }
}

async function entryFromRow(
  userId: string,
  row: EntryRow,
  sections: SectionRow[],
  media: MediaRow[],
  local?: JournalEntry,
): Promise<JournalEntry | null> {
  const section = sections.find((candidate) => candidate.id === row.section_id);
  if (!section || !row.title || !row.body) return null;
  // Entries in the retired Travel and Other folders are shown in Notes and move
  // there in the database the next time they are saved.
  const sectionId = isRetired(section) ? notesFolderId : sectionKey(section);

  const todoItems: TodoItem[] = [...(row.todo_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      completed: item.completed,
      dueTag: item.due_tag,
      id: item.id,
      text: item.text,
    }));

  const entryMedia = media.filter((item) => item.entry_id === row.id);
  const cover = entryMedia.find((item) => item.is_cover);
  const attachmentRows = entryMedia.filter((item) => !item.is_cover).sort((a, b) => a.sort_order - b.sort_order);
  const coverLocalUri =
    cover && local?.coverStoragePath === cover.storage_path ? (local.coverUri ?? undefined) : undefined;
  const mappedAttachments = await Promise.all(
    attachmentRows.map(async (item) => {
      const localAttachment = local?.attachments.find((candidate) => candidate.storagePath === item.storage_path);
      const uri = await cachedMediaUri(userId, item, localAttachment?.uri);
      if (!uri) return null;
      return {
        createdAt: item.captured_at ?? row.entry_date,
        id: item.id,
        mimeType: item.mime_type,
        storagePath: item.storage_path,
        uri,
      };
    }),
  );
  const attachments = mappedAttachments.filter((attachment): attachment is NonNullable<typeof attachment> =>
    Boolean(attachment),
  );

  return {
    attachments,
    body: row.body,
    coverMediaId: cover?.id ?? null,
    coverMimeType: cover?.mime_type ?? null,
    coverStoragePath: cover?.storage_path ?? null,
    coverUri: cover ? await cachedMediaUri(userId, cover, coverLocalUri) : null,
    createdAt: row.entry_date,
    deletedAt: row.deleted_at ?? null,
    description: row.description ?? '',
    favorite: row.favorite,
    id: row.id,
    latitude: row.latitude,
    locationLabel: row.location_label,
    longitude: row.longitude,
    mood: row.mood,
    moodSuggestion: row.mood_suggestion ?? null,
    plainText: row.plain_text ?? '',
    reviewed: row.reviewed,
    sectionId,
    syncVersion: row.sync_version,
    title: row.title,
    todoItems,
    tripId: row.trip_id,
    updatedAt: row.updated_at,
    ...(section.built_in_key === 'travel' && !row.trip_id ? { legacyTravel: true } : {}),
  };
}

function tripFromRow(row: TripRow): Trip {
  return {
    destination: row.destination,
    emoji: row.emoji,
    endDate: row.end_date,
    id: row.id,
    startDate: row.start_date,
    syncVersion: row.sync_version,
    updatedAt: row.updated_at,
  };
}

function entryPayload(userId: string, sectionId: string, entry: JournalEntry) {
  return {
    body: entry.body,
    deleted_at: entry.deletedAt ?? null,
    description: entry.description || null,
    entry_date: entry.createdAt,
    favorite: entry.favorite,
    id: entry.id,
    is_private: false,
    latitude: entry.latitude,
    location_label: entry.locationLabel,
    longitude: entry.longitude,
    mood: entry.mood,
    mood_suggestion: entry.moodSuggestion ?? null,
    plain_text: entry.plainText,
    reviewed: entry.reviewed,
    section_id: sectionId,
    title: entry.title,
    trip_id: entry.tripId ?? null,
    user_id: userId,
  };
}

// JSON with object keys sorted, so a body read back from Postgres (whose jsonb reorders keys)
// compares equal to the one the device sent.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    // Keys set to undefined are dropped when sent to Supabase, so they are skipped here too.
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Whether the server row already holds exactly what this device is saving. That happens when an
// earlier save reached Supabase but its response was lost, so the device still has the old version.
function rowMatchesPayload(row: Record<string, unknown>, payload: ReturnType<typeof entryPayload>) {
  return (Object.keys(payload) as (keyof typeof payload)[]).every((key) => {
    const sent = payload[key];
    const stored = row[key];
    if (key === 'body' || key === 'mood_suggestion') return stableJson(stored) === stableJson(sent);
    if (key === 'entry_date') return Date.parse(String(stored)) === Date.parse(String(sent));
    // The server sets its own deletion time, so only whether the entry is deleted is compared.
    if (key === 'deleted_at') return (stored ?? null) === null ? sent === null : sent !== null;
    return (stored ?? null) === (sent ?? null);
  });
}

// Weekly summaries are written from entry text, so the ones covering a deleted entry are removed;
// opening the summary again writes a new one without it. The API picks a summary's entries by
// their UTC date (server/ai-store.mjs listWeeklyEntries), so the same date is used here.
async function deleteSummariesCovering(userId: string, entryDate: string) {
  const day = new Date(entryDate).toISOString().slice(0, 10);
  const { error } = await supabase
    .from('weekly_summaries')
    .delete()
    .eq('user_id', userId)
    .lte('period_start', day)
    .gte('period_end', day);
  if (error) throw error;
}

async function replaceTodoItems(userId: string, entry: JournalEntry) {
  const items = entry.todoItems ?? [];
  const { data: existing, error: readError } = await supabase.from('todo_items').select('id').eq('entry_id', entry.id);
  if (readError) throw readError;

  if (items.length > 0) {
    const { error } = await supabase.from('todo_items').upsert(
      items.map((item, position) => ({
        completed: item.completed,
        due_tag: item.dueTag,
        entry_id: entry.id,
        id: item.id,
        position,
        text: item.text,
        user_id: userId,
      })),
      { onConflict: 'id' },
    );
    if (error) throw error;
  }

  const currentIds = new Set(items.map((item) => item.id));
  const staleIds = existing.filter((item) => !currentIds.has(item.id)).map((item) => item.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from('todo_items').delete().in('id', staleIds);
    if (error) throw error;
  }
}

function mediaExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('heif')) return 'heif';
  return 'jpg';
}

async function synchronizeEntryMedia(userId: string, entry: JournalEntry) {
  const { data: existing, error: existingError } = await supabase
    .from('entry_media')
    .select('id,storage_path')
    .eq('entry_id', entry.id);
  if (existingError) throw existingError;

  const coverId = entry.coverUri ? (entry.coverMediaId ?? randomUUID()) : null;
  const desired = [
    ...(entry.coverUri && coverId
      ? [
          {
            capturedAt: entry.createdAt,
            id: coverId,
            isCover: true,
            mimeType: entry.coverMimeType ?? 'image/jpeg',
            storagePath: entry.coverStoragePath ?? null,
            uri: entry.coverUri,
          },
        ]
      : []),
    ...entry.attachments.map((attachment) => ({
      capturedAt: attachment.createdAt,
      id: attachment.id,
      isCover: false,
      mimeType: attachment.mimeType ?? 'image/jpeg',
      storagePath: attachment.storagePath ?? null,
      uri: attachment.uri,
    })),
  ];

  // Remove replaced rows first: a new cover cannot be written while the old one
  // exists (entry_media_one_cover_idx). Files go only after the new media is saved.
  const desiredIds = new Set(desired.map((item) => item.id));
  const stale = existing.filter((item) => !desiredIds.has(item.id));
  if (stale.length > 0) {
    const { error } = await supabase
      .from('entry_media')
      .delete()
      .in(
        'id',
        stale.map((item) => item.id),
      );
    if (error) throw error;
  }

  const synchronized = [] as ((typeof desired)[number] & { storagePath: string })[];
  for (let position = 0; position < desired.length; position += 1) {
    const item = desired[position]!;
    const storagePath = item.storagePath ?? `${userId}/entries/${entry.id}/${item.id}.${mediaExtension(item.mimeType)}`;
    if (!item.storagePath) {
      const bytes = await mediaCache.read(item.uri);
      const { error } = await supabase.storage.from('journal-media').upload(storagePath, bytes, {
        contentType: item.mimeType,
        upsert: true,
      });
      if (error) throw error;
    }
    const { error } = await supabase.from('entry_media').upsert(
      {
        captured_at: item.capturedAt,
        entry_id: entry.id,
        id: item.id,
        is_cover: item.isCover,
        is_private: false,
        mime_type: item.mimeType,
        sort_order: item.isCover ? 0 : position,
        storage_path: storagePath,
        user_id: userId,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
    synchronized.push({ ...item, storagePath });
  }

  const keptPaths = new Set(synchronized.map((item) => item.storagePath));
  const stalePaths = stale.map((item) => item.storage_path).filter((path) => !keptPaths.has(path));
  if (stalePaths.length > 0) await supabase.storage.from('journal-media').remove(stalePaths);

  const synchronizedCover = synchronized.find((item) => item.isCover);
  return {
    ...entry,
    attachments: synchronized
      .filter((item) => !item.isCover)
      .map((item) => ({
        createdAt: item.capturedAt,
        id: item.id,
        mimeType: item.mimeType,
        storagePath: item.storagePath,
        uri: item.uri,
      })),
    coverMediaId: synchronizedCover?.id ?? null,
    coverMimeType: synchronizedCover?.mimeType ?? null,
    coverStoragePath: synchronizedCover?.storagePath ?? null,
  } satisfies JournalEntry;
}

async function pullJournal(userId: string, localEntries: JournalEntry[]) {
  const [initialSectionsResult, entriesResult, tripsResult, mediaResult] = await Promise.all([
    supabase.from('journal_sections').select(sectionColumns).eq('user_id', userId),
    supabase
      .from('entries')
      .select('*,todo_items(id,text,due_tag,completed,position)')
      .eq('user_id', userId)
      .eq('is_private', false),
    supabase.from('trips').select('*').eq('user_id', userId),
    supabase
      .from('entry_media')
      .select('id,entry_id,storage_path,is_cover,sort_order,mime_type,captured_at')
      .eq('user_id', userId)
      .eq('is_private', false),
  ]);

  if (initialSectionsResult.error) throw initialSectionsResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (tripsResult.error) throw tripsResult.error;
  if (mediaResult.error) throw mediaResult.error;

  let sections = initialSectionsResult.data as SectionRow[];
  // Only Notes and Private must always exist; other built-in folders can be deleted
  // by the user and are not recreated.
  const existingSectionKeys = new Set(sections.map((section) => section.built_in_key));
  const missingSections = defaultFolders.filter(
    (folder) => (folder.id === notesFolderId || folder.id === privateFolderId) && !existingSectionKeys.has(folder.id),
  );
  if (missingSections.length > 0) {
    const { error } = await supabase.from('journal_sections').insert(
      missingSections.map((folder) => ({
        built_in_key: folder.id,
        collapsed: false,
        emoji: folder.emoji,
        is_private: Boolean(folder.locked),
        name: folder.name,
        position: folder.position,
        user_id: userId,
      })),
    );
    if (error && error.code !== '23505') throw error;
    const refreshed = await supabase.from('journal_sections').select(sectionColumns).eq('user_id', userId);
    if (refreshed.error) throw refreshed.error;
    sections = refreshed.data as SectionRow[];
  }
  const mappedEntries = await Promise.all(
    (entriesResult.data as EntryRow[]).map((row) =>
      entryFromRow(
        userId,
        row,
        sections,
        mediaResult.data as MediaRow[],
        localEntries.find((entry) => entry.id === row.id),
      ),
    ),
  );
  const entries = mappedEntries.filter((entry): entry is JournalEntry => Boolean(entry));

  return {
    entries,
    expandedSectionIds: sections.filter((section) => !section.collapsed && !isRetired(section)).map(sectionKey),
    folders: sortFolders(sections.map(folderFromRow).filter((folder): folder is JournalFolder => Boolean(folder))),
    sections,
    trips: (tripsResult.data as TripRow[]).map(tripFromRow),
  };
}

export async function synchronizeJournal(userId: string, local: PersistedJournal): Promise<PersistedJournal> {
  let entries = [...local.entries];
  let trips = [...local.trips];
  const syncIssues = (local.syncIssues ?? []).filter((issue) => issue.kind !== 'error');
  const remaining: JournalMutation[] = [];
  const acknowledged: Record<string, number> = {};
  const initialPull = await pullJournal(userId, entries);
  const sectionMap = new Map(initialPull.sections.map((section) => [sectionKey(section), section]));
  const remoteEntryVersions = new Map(initialPull.entries.map((entry) => [entry.id, entry.syncVersion]));
  const remoteTripVersions = new Map(initialPull.trips.map((trip) => [trip.id, trip.syncVersion]));

  for (let index = 0; index < local.pending.length; index += 1) {
    const mutation = local.pending[index]!;
    // Set once the entry row is written, so a later To-Do or media failure retries
    // from the version the server now holds instead of creating a conflict copy.
    let saved: { entry: JournalEntry; replacesId: string } | null = null;
    try {
      if (mutation.kind === 'entry-upsert') {
        const normalized = normalizeEntryMedia(mutation.entry);
        if (normalized.sectionId === privateFolderId) throw new Error('Entry section cannot be synchronized.');
        // Entries whose folder is retired or was deleted on another device are saved to Notes.
        const requested = sectionMap.get(normalized.sectionId);
        const section = requested && !isRetired(requested) ? requested : sectionMap.get(notesFolderId);
        if (!section) throw new Error('Entry section cannot be synchronized.');
        // A retired Travel entry keeps its trip by being linked to the trip covering its date.
        const legacyTrip =
          normalized.legacyTravel && !normalized.tripId ? tripContainingDate(trips, normalized.createdAt) : undefined;
        const { legacyTravel: _legacyTravel, ...withoutLegacy } = normalized;
        const localEntry: JournalEntry = {
          ...(normalized.legacyTravel && !legacyTrip ? normalized : withoutLegacy),
          sectionId: sectionKey(section),
          tripId: normalized.tripId ?? legacyTrip?.id ?? null,
        };
        const payload = entryPayload(userId, section.id, localEntry);
        const expectedVersion =
          mutation.baseVersion > 0 ? mutation.baseVersion : (remoteEntryVersions.get(mutation.entityId) ?? 0);
        const query =
          expectedVersion > 0
            ? supabase.from('entries').update(payload).eq('id', mutation.entityId).eq('sync_version', expectedVersion)
            : supabase.from('entries').insert(payload);
        let { data, error } = await query.select('sync_version,updated_at').maybeSingle();
        if (error) throw error;
        let remoteMissing = false;

        if (!data && expectedVersion > 0) {
          // Before calling it a conflict: if exactly one save happened since this device's version
          // (each save adds 1) and the row holds exactly this content, that save was this device's
          // own and only its response was lost, so accept it. Any further change, even to To-Dos or
          // photos only (which also re-save the row), still becomes a conflict copy.
          const { data: current, error: readError } = await supabase
            .from('entries')
            .select('*')
            .eq('id', mutation.entityId)
            .maybeSingle();
          if (readError) throw readError;
          remoteMissing = !current;
          if (current && current.sync_version === expectedVersion + 1 && rowMatchesPayload(current, payload)) {
            data = { sync_version: current.sync_version, updated_at: current.updated_at };
          }
        }

        if (!data && remoteMissing && localEntry.deletedAt) {
          // Moving to Recently Deleted an entry that was already deleted for good elsewhere (or by the
          // 30-day cleanup): there is nothing left to keep.
          entries = entries.filter((entry) => entry.id !== mutation.entityId);
        } else if (!data && expectedVersion > 0) {
          const conflictEntry = {
            ...localEntry,
            attachments: localEntry.attachments.map((item) => ({ ...item, id: randomUUID(), storagePath: null })),
            coverMediaId: localEntry.coverUri ? randomUUID() : null,
            coverStoragePath: null,
            id: randomUUID(),
            syncVersion: 0,
            title: `${localEntry.title} (conflict copy)`,
            todoItems: localEntry.todoItems?.map((item) => ({ ...item, id: randomUUID() })),
            updatedAt: new Date().toISOString(),
          };
          const { data: conflictData, error: conflictError } = await supabase
            .from('entries')
            .insert(entryPayload(userId, section.id, conflictEntry))
            .select('sync_version,updated_at')
            .single();
          if (conflictError) throw conflictError;
          saved = {
            entry: { ...conflictEntry, syncVersion: conflictData.sync_version, updatedAt: conflictData.updated_at },
            replacesId: mutation.entityId,
          };
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: remoteMissing
              ? `“${localEntry.title}” was deleted on another device. Your version was saved as a conflict copy.`
              : `“${localEntry.title}” changed on another device. Your version was saved as a conflict copy.`,
          });
          await replaceTodoItems(userId, conflictEntry);
          const synchronizedConflict = await synchronizeEntryMedia(userId, conflictEntry);
          entries = entries
            .filter((entry) => entry.id !== mutation.entityId)
            .concat({
              ...synchronizedConflict,
              syncVersion: conflictData.sync_version,
              updatedAt: conflictData.updated_at,
            });
        } else if (data) {
          acknowledged[mutation.entityId] = data.sync_version;
          saved = {
            entry: { ...localEntry, syncVersion: data.sync_version, updatedAt: data.updated_at },
            replacesId: mutation.entityId,
          };
          await replaceTodoItems(userId, localEntry);
          if (localEntry.deletedAt) await deleteSummariesCovering(userId, localEntry.createdAt);
          const synchronizedEntry = await synchronizeEntryMedia(userId, localEntry);
          entries = entries.map((entry) =>
            entry.id === mutation.entityId
              ? { ...synchronizedEntry, syncVersion: data.sync_version, updatedAt: data.updated_at }
              : entry,
          );
        }
      } else if (mutation.kind === 'entry-delete') {
        const { data: currentEntry, error: versionError } = await supabase
          .from('entries')
          .select('sync_version,entry_date')
          .eq('id', mutation.entityId)
          .maybeSingle();
        if (versionError) throw versionError;
        if (currentEntry && mutation.baseVersion > 0 && currentEntry.sync_version !== mutation.baseVersion) {
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: 'An entry changed on another device, so its offline deletion was not applied.',
          });
          continue;
        }
        if (currentEntry) await deleteSummariesCovering(userId, currentEntry.entry_date);
        const { data: mediaRows } = await supabase
          .from('entry_media')
          .select('storage_path')
          .eq('entry_id', mutation.entityId);
        const { error } = await supabase.from('entries').delete().eq('id', mutation.entityId);
        if (error) throw error;
        const mediaPaths = (mediaRows ?? []).map((item) => item.storage_path);
        if (mediaPaths.length > 0) await supabase.storage.from('journal-media').remove(mediaPaths);
        const { error: tombstoneError } = await supabase.from('sync_tombstones').upsert(
          {
            entity_id: mutation.entityId,
            entity_type: 'entry',
            sync_version: Math.max(1, mutation.baseVersion + 1),
            user_id: userId,
          },
          { onConflict: 'user_id,entity_type,entity_id' },
        );
        if (tombstoneError) throw tombstoneError;
      } else if (mutation.kind === 'trip-upsert') {
        const payload = {
          destination: mutation.trip.destination,
          emoji: mutation.trip.emoji,
          end_date: mutation.trip.endDate,
          id: mutation.trip.id,
          start_date: mutation.trip.startDate,
          user_id: userId,
        };
        const expectedVersion =
          mutation.baseVersion > 0 ? mutation.baseVersion : (remoteTripVersions.get(mutation.entityId) ?? 0);
        const query =
          expectedVersion > 0
            ? supabase.from('trips').update(payload).eq('id', mutation.entityId).eq('sync_version', expectedVersion)
            : supabase.from('trips').insert(payload);
        const { data, error } = await query.select('sync_version,updated_at').maybeSingle();
        if (error) throw error;
        if (!data && expectedVersion > 0) {
          const conflictTrip = {
            ...mutation.trip,
            destination: `${mutation.trip.destination} (conflict copy)`,
            id: randomUUID(),
            syncVersion: 0,
            updatedAt: new Date().toISOString(),
          };
          const { data: conflictData, error: conflictError } = await supabase
            .from('trips')
            .insert({
              destination: conflictTrip.destination,
              emoji: conflictTrip.emoji,
              end_date: conflictTrip.endDate,
              id: conflictTrip.id,
              start_date: conflictTrip.startDate,
              user_id: userId,
            })
            .select('sync_version,updated_at')
            .single();
          if (conflictError) throw conflictError;
          trips = trips
            .filter((trip) => trip.id !== mutation.entityId)
            .concat({
              ...conflictTrip,
              syncVersion: conflictData.sync_version,
              updatedAt: conflictData.updated_at,
            });
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: `“${mutation.trip.destination}” changed on another device. Your version was saved as a conflict copy.`,
          });
        } else if (data) {
          acknowledged[mutation.entityId] = data.sync_version;
          trips = trips.map((trip) =>
            trip.id === mutation.entityId
              ? { ...trip, syncVersion: data.sync_version, updatedAt: data.updated_at }
              : trip,
          );
        }
      } else if (mutation.kind === 'trip-delete') {
        const { data: currentTrip, error: versionError } = await supabase
          .from('trips')
          .select('sync_version')
          .eq('id', mutation.entityId)
          .maybeSingle();
        if (versionError) throw versionError;
        if (currentTrip && mutation.baseVersion > 0 && currentTrip.sync_version !== mutation.baseVersion) {
          syncIssues.push({
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'conflict',
            message: 'A trip changed on another device, so its offline deletion was not applied.',
          });
          continue;
        }
        const { error } = await supabase.from('trips').delete().eq('id', mutation.entityId);
        if (error) throw error;
        const { error: tombstoneError } = await supabase.from('sync_tombstones').upsert(
          {
            entity_id: mutation.entityId,
            entity_type: 'trip',
            sync_version: Math.max(1, mutation.baseVersion + 1),
            user_id: userId,
          },
          { onConflict: 'user_id,entity_type,entity_id' },
        );
        if (tombstoneError) throw tombstoneError;
      } else if (mutation.kind === 'folder-create') {
        const { error } = await supabase.from('journal_sections').insert({
          built_in_key: null,
          collapsed: false,
          emoji: mutation.folder.emoji,
          id: mutation.entityId,
          is_private: false,
          name: mutation.folder.name,
          position: mutation.folder.position,
          user_id: userId,
        });
        // 23505: the folder was already created by an earlier attempt.
        if (error && error.code !== '23505') throw error;
        sectionMap.set(mutation.entityId, {
          built_in_key: null,
          collapsed: false,
          emoji: mutation.folder.emoji,
          id: mutation.entityId,
          name: mutation.folder.name,
          position: mutation.folder.position,
        });
      } else if (mutation.kind === 'folder-delete') {
        if (mutation.entityId === notesFolderId || mutation.entityId === privateFolderId) {
          throw new Error('Notes and Private cannot be deleted.');
        }
        const section = sectionMap.get(mutation.entityId);
        if (section) {
          // Deleting a folder row deletes its entries in the database, so the folder
          // is only removed once every entry has been moved out of it.
          const { data: remainingEntries, error: countError } = await supabase
            .from('entries')
            .select('id')
            .eq('section_id', section.id)
            .limit(1);
          if (countError) throw countError;
          if ((remainingEntries ?? []).length > 0) {
            throw new Error(
              'The folder still has entries on the server. They are moved to Notes first, then it is deleted.',
            );
          }
          const { error } = await supabase.from('journal_sections').delete().eq('id', section.id);
          if (error) throw error;
          sectionMap.delete(mutation.entityId);
        }
      } else {
        const section = sectionMap.get(mutation.entityId);
        if (!section) throw new Error('Journal section was not found.');
        const { error } = await supabase
          .from('journal_sections')
          .update({ collapsed: mutation.collapsed })
          .eq('id', section.id);
        if (error) throw error;
      }
    } catch (error) {
      syncIssues.push({
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        kind: 'error',
        message: `Could not sync this ${mutationLabel(mutation)}. ${storageLimitMessage(error) ?? syncErrorMessage(error)} It remains safely stored on this device.`,
      });
      if (saved) {
        const retryEntry = saved.entry;
        entries = entries
          .filter((entry) => entry.id !== saved!.replacesId && entry.id !== retryEntry.id)
          .concat(retryEntry);
        remaining.push({
          baseVersion: retryEntry.syncVersion ?? 0,
          entityId: retryEntry.id,
          entry: retryEntry,
          kind: 'entry-upsert',
          mutationId: mutation.mutationId,
        });
      } else {
        remaining.push(mutation);
      }
    }
  }

  const remote = await pullJournal(userId, entries);
  const pendingEntryIds = new Set(
    remaining.filter((item) => item.kind.startsWith('entry-')).map((item) => item.entityId),
  );
  const pendingTripIds = new Set(
    remaining.filter((item) => item.kind.startsWith('trip-')).map((item) => item.entityId),
  );
  const mergedEntries = remote.entries
    .filter((entry) => !pendingEntryIds.has(entry.id))
    .concat(entries.filter((entry) => pendingEntryIds.has(entry.id)));
  const mergedTrips = remote.trips
    .filter((trip) => !pendingTripIds.has(trip.id))
    .concat(trips.filter((trip) => pendingTripIds.has(trip.id)));
  // Folders created or deleted on this device but not yet synced keep their local state.
  const pendingFolderCreates = new Set(
    remaining.filter((item) => item.kind === 'folder-create').map((item) => item.entityId),
  );
  const pendingFolderDeletes = new Set(
    remaining.filter((item) => item.kind === 'folder-delete').map((item) => item.entityId),
  );
  const mergedFolders = sortFolders(
    remote.folders
      .filter((folder) => !pendingFolderDeletes.has(folder.id))
      .concat(
        (local.folders ?? []).filter(
          (folder) =>
            pendingFolderCreates.has(folder.id) && !remote.folders.some((candidate) => candidate.id === folder.id),
        ),
      ),
  );

  return {
    acknowledged,
    entries: mergedEntries,
    expandedSectionIds: remaining.some((item) => item.kind === 'section-update')
      ? local.expandedSectionIds
      : remote.expandedSectionIds,
    folders: mergedFolders,
    pending: remaining,
    syncIssues,
    trips: mergedTrips,
    version: 1,
  };
}
