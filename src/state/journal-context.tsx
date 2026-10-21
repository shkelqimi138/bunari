// Journal provider: entries, folders, trips, local persistence, and sync
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  journalStorageKey,
  mergeJournalMutation,
  normalizeJournalMutations,
  queuePermanentDeletes,
  reconcileJournalSync,
  type JournalMutation,
  type PersistedJournal,
  type SyncIssue,
  synchronizeJournal,
} from '@/data/journal-sync';
import { readLocalJson, writeLocalJson } from '@/data/local-store';
import { todosForNewEntry, toggleEntryTodo } from '@/domain/checklist';
import {
  defaultFolders,
  isDeletableFolder,
  normalizeRetiredEntry,
  notesFolderId,
  resolveEntryFolderId,
  sortFolders,
  type JournalEntry,
  type JournalFolder,
  type JournalSectionId,
  type RichTextDocument,
  type Trip,
} from '@/domain/journal';
import { deletedEntries as deletedEntriesOf, expiredIds, isExpired, liveEntries } from '@/domain/recently-deleted';
import { hasStorageLimitIssue } from '@/domain/storage-limits';
import { useIsOnline } from '@/hooks/use-is-online';
import { useAuth } from '@/state/auth-context';

export type NewEntryInput = {
  attachments?: JournalEntry['attachments'];
  body: RichTextDocument;
  coverMediaId?: string | null;
  coverMimeType?: string | null;
  coverStoragePath?: string | null;
  coverUri?: string | null;
  description: string;
  // Private only: the protected folder the entry is created in.
  folderId?: string | null;
  latitude?: number | null;
  locationLabel?: string | null;
  longitude?: number | null;
  plainText: string;
  sectionId: JournalSectionId;
  title: string;
  todoItems?: JournalEntry['todoItems'];
  tripId?: string | null;
};

type NewTripInput = Omit<Trip, 'id' | 'syncVersion' | 'updatedAt'>;
export type SyncStatus = 'idle' | 'offline' | 'syncing' | 'error';

type JournalContextValue = {
  createEntry: (input: NewEntryInput) => JournalEntry;
  createFolder: (name: string, emoji: string) => JournalFolder;
  deleteFolder: (folderId: string) => void;
  folders: JournalFolder[];
  createTrip: (input: NewTripInput) => Trip;
  // Moves the entry to Recently Deleted; it can be restored for 30 days.
  deleteEntry: (entryId: string) => void;
  // Deletes entries for good, with their photos (Delete now, Delete all, and the 30-day cleanup).
  deleteEntriesForever: (entryIds: string[]) => void;
  // Entries in Recently Deleted, the most recently deleted first.
  deletedEntries: JournalEntry[];
  deleteTrip: (tripId: string) => void;
  // Entries that are not deleted. Every list, count, search and export uses these.
  entries: JournalEntry[];
  expandedSectionIds: JournalSectionId[];
  getEntry: (entryId: string | undefined) => JournalEntry | undefined;
  pendingChangeCount: number;
  ready: boolean;
  dismissSyncIssue: (issueId: string) => void;
  // Returns false when the entry is not in Recently Deleted or its 30 days are over.
  restoreEntry: (entryId: string) => boolean;
  retrySync: () => void;
  syncIssues: SyncIssue[];
  syncStatus: SyncStatus;
  toggleFavorite: (entryId: string) => void;
  toggleReviewed: (entryId: string) => void;
  toggleSectionExpanded: (sectionId: JournalSectionId) => void;
  toggleTodoItem: (entryId: string, todoItemId: string) => void;
  trips: Trip[];
  updateEntry: (entryId: string, changes: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>) => void;
};

const JournalContext = createContext<JournalContextValue | null>(null);
const emptyState: PersistedJournal = {
  entries: [],
  expandedSectionIds: ['home'],
  folders: defaultFolders,
  pending: [],
  trips: [],
  version: 1,
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function JournalProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [folders, setFolders] = useState<JournalFolder[]>(defaultFolders);
  const [expandedSectionIds, setExpandedSectionIds] = useState<JournalSectionId[]>(['home']);
  const [pending, setPending] = useState<JournalMutation[]>([]);
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [retryNonce, setRetryNonce] = useState(0);
  const syncingRef = useRef(false);
  const attemptedPendingRef = useRef<string | null>(null);
  const stateRef = useRef<PersistedJournal>(emptyState);
  const pulledUserRef = useRef<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const userId = user?.id;
    pulledUserRef.current = null;
    loadedUserRef.current = null;

    if (!userId) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setEntries([]);
        setTrips([]);
        setFolders(defaultFolders);
        setExpandedSectionIds(['home']);
        setPending([]);
        setSyncIssues([]);
        setLoadedUserId(null);
        setHydrated(true);
      });
      return () => {
        active = false;
      };
    }

    void readLocalJson<PersistedJournal>(journalStorageKey(userId)).then((saved) => {
      if (!active) return;
      const next = saved?.version === 1 ? saved : emptyState;
      const nextEntries = next.entries.filter((entry) => entry.sectionId !== 'private').map(normalizeRetiredEntry);
      let nextPending = normalizeJournalMutations(
        next.pending.filter((mutation) => mutation.kind !== 'entry-upsert' || mutation.entry.sectionId !== 'private'),
      );
      for (const entry of nextEntries) {
        const hasUnsyncedMedia =
          (entry.coverUri && !entry.coverStoragePath) ||
          entry.attachments.some((attachment) => !attachment.storagePath);
        if (hasUnsyncedMedia) {
          nextPending = mergeJournalMutation(nextPending, {
            baseVersion: entry.syncVersion ?? 0,
            entityId: entry.id,
            entry,
            kind: 'entry-upsert',
            mutationId: randomUUID(),
          });
        }
      }
      setEntries(nextEntries);
      setTrips(next.trips);
      setFolders(next.folders ?? defaultFolders);
      setExpandedSectionIds(next.expandedSectionIds);
      setPending(nextPending);
      setSyncIssues(next.syncIssues ?? []);
      loadedUserRef.current = userId;
      setLoadedUserId(userId);
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    stateRef.current = { entries, expandedSectionIds, folders, pending, syncIssues, trips, version: 1 };
  }, [entries, expandedSectionIds, folders, pending, syncIssues, trips]);

  useEffect(() => {
    if (!hydrated || !user || loadedUserRef.current !== user.id) return;
    const timer = setTimeout(() => {
      if (loadedUserRef.current !== user.id) return;
      void writeLocalJson(journalStorageKey(user.id), {
        entries: entries.filter((entry) => entry.sectionId !== 'private'),
        expandedSectionIds,
        folders,
        pending,
        syncIssues,
        trips,
        version: 1,
      } satisfies PersistedJournal);
    }, 150);
    return () => clearTimeout(timer);
  }, [entries, expandedSectionIds, folders, hydrated, pending, syncIssues, trips, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!user || loadedUserRef.current !== user.id) return;
      if (nextState === 'active') {
        pulledUserRef.current = null;
        // Coming back always tries once more, also while a storage limit has paused the retries every
        // few seconds; otherwise the same queued changes would be skipped, and with them the pull of
        // other devices' changes (code review, 2026-10-08).
        attemptedPendingRef.current = null;
        setRetryNonce((value) => value + 1);
      } else {
        void writeLocalJson(journalStorageKey(user.id), stateRef.current);
      }
    });
    return () => subscription.remove();
  }, [user]);

  useEffect(() => {
    if (!hydrated || !user || loadedUserRef.current !== user.id || syncingRef.current) return;
    if (!isOnline) {
      attemptedPendingRef.current = null;
      return;
    }
    if (pending.length === 0 && pulledUserRef.current === user.id) {
      return;
    }

    const pendingSignature = pending.map((mutation) => mutation.mutationId).join(':');
    if (pending.length > 0 && attemptedPendingRef.current === pendingSignature) return;
    attemptedPendingRef.current = pendingSignature;
    syncingRef.current = true;
    const snapshot: PersistedJournal = { entries, expandedSectionIds, folders, pending, syncIssues, trips, version: 1 };
    void (async () => {
      setSyncStatus('syncing');
      try {
        const result = await synchronizeJournal(user.id, snapshot);
        const reconciled = reconcileJournalSync(stateRef.current, snapshot, result);
        setEntries(reconciled.entries);
        setExpandedSectionIds(reconciled.expandedSectionIds);
        setPending(reconciled.pending);
        setSyncIssues(reconciled.syncIssues ?? []);
        setTrips(reconciled.trips);
        if (reconciled.folders) setFolders(reconciled.folders);
        pulledUserRef.current = user.id;
        setSyncStatus(reconciled.pending.length > 0 ? 'error' : 'idle');
        if (reconciled.pending.length === 0) attemptedPendingRef.current = null;
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? `Sync could not reach your journal data. ${caught.message}`
            : 'Sync could not reach your journal data. Your changes remain safely stored on this device.';
        setSyncIssues((current) => [
          {
            createdAt: new Date().toISOString(),
            id: randomUUID(),
            kind: 'error',
            message,
          },
          ...current.filter((issue) => issue.kind !== 'error'),
        ]);
        setSyncStatus('error');
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [entries, expandedSectionIds, folders, hydrated, isOnline, pending, retryNonce, syncIssues, trips, user]);

  useEffect(() => {
    if (syncStatus !== 'error' || !isOnline || pending.length === 0 || hasStorageLimitIssue(syncIssues)) return;
    const timer = setTimeout(() => {
      attemptedPendingRef.current = null;
      setRetryNonce((value) => value + 1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isOnline, pending.length, syncIssues, syncStatus]);

  const queueEntry = useCallback((entry: JournalEntry) => {
    setPending((current) =>
      mergeJournalMutation(current, {
        baseVersion: entry.syncVersion ?? 0,
        entityId: entry.id,
        entry,
        kind: 'entry-upsert',
        mutationId: randomUUID(),
      }),
    );
  }, []);

  const persistEntrySnapshot = useCallback(
    (entry: JournalEntry) => {
      const current = stateRef.current;
      const alreadyExists = current.entries.some((candidate) => candidate.id === entry.id);
      const next: PersistedJournal = {
        ...current,
        entries: alreadyExists
          ? current.entries.map((candidate) => (candidate.id === entry.id ? entry : candidate))
          : [entry, ...current.entries],
        pending: mergeJournalMutation(current.pending, {
          baseVersion: entry.syncVersion ?? 0,
          entityId: entry.id,
          entry,
          kind: 'entry-upsert',
          mutationId: randomUUID(),
        }),
      };
      stateRef.current = next;
      setEntries(next.entries);
      setPending(next.pending);
      if (user && loadedUserRef.current === user.id) {
        void writeLocalJson(journalStorageKey(user.id), next);
      }
    },
    [user],
  );

  const createEntry = useCallback(
    (input: NewEntryInput) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      const entry: JournalEntry = {
        ...input,
        // A folder deleted meanwhile (for example on another device) falls back to Notes.
        sectionId: resolveEntryFolderId(input.sectionId, stateRef.current.folders ?? defaultFolders),
        id,
        attachments: input.attachments ?? [],
        coverUri: input.coverUri ?? null,
        favorite: false,
        reviewed: false,
        todoItems: todosForNewEntry(id, input.body, input.todoItems, randomUUID),
        mood: null,
        latitude: input.latitude ?? null,
        locationLabel: input.locationLabel ?? null,
        longitude: input.longitude ?? null,
        syncVersion: 0,
        createdAt: now,
        updatedAt: now,
      };
      persistEntrySnapshot(entry);
      return entry;
    },
    [persistEntrySnapshot],
  );

  const createFolder = useCallback((name: string, emoji: string) => {
    const existing = stateRef.current.folders ?? defaultFolders;
    const folder: JournalFolder = {
      builtInKey: null,
      emoji: emoji.trim() || '📁',
      id: randomUUID(),
      name: name.trim(),
      position: Math.max(0, ...existing.map((candidate) => candidate.position)) + 1,
    };
    setFolders((current) => sortFolders([...current, folder]));
    setPending((current) =>
      mergeJournalMutation(current, {
        entityId: folder.id,
        folder: { emoji: folder.emoji, name: folder.name, position: folder.position },
        kind: 'folder-create',
        mutationId: randomUUID(),
      }),
    );
    return folder;
  }, []);

  // Moves the folder's entries to Notes first; the folder row is removed on sync
  // only once it is empty, so deleting a folder never deletes entries.
  const deleteFolder = useCallback(
    (folderId: string) => {
      if (!isDeletableFolder(folderId)) return;
      const current = stateRef.current;
      const now = new Date().toISOString();
      const moved = new Map(
        current.entries
          .filter((entry) => entry.sectionId === folderId)
          .map((entry) => [entry.id, { ...entry, sectionId: notesFolderId, updatedAt: now }]),
      );
      let nextPending = current.pending.filter(
        (mutation) => !(mutation.kind === 'section-update' && mutation.entityId === folderId),
      );
      for (const entry of moved.values()) {
        nextPending = mergeJournalMutation(nextPending, {
          baseVersion: entry.syncVersion ?? 0,
          entityId: entry.id,
          entry,
          kind: 'entry-upsert',
          mutationId: randomUUID(),
        });
      }
      nextPending = mergeJournalMutation(nextPending, {
        entityId: folderId,
        kind: 'folder-delete',
        mutationId: randomUUID(),
      });
      const next: PersistedJournal = {
        ...current,
        entries: current.entries.map((entry) => moved.get(entry.id) ?? entry),
        expandedSectionIds: current.expandedSectionIds.filter((id) => id !== folderId),
        folders: (current.folders ?? defaultFolders).filter((folder) => folder.id !== folderId),
        pending: nextPending,
      };
      stateRef.current = next;
      setEntries(next.entries);
      setExpandedSectionIds(next.expandedSectionIds);
      setFolders(next.folders ?? defaultFolders);
      setPending(next.pending);
      if (user && loadedUserRef.current === user.id) void writeLocalJson(journalStorageKey(user.id), next);
    },
    [user],
  );

  const createTrip = useCallback((input: NewTripInput) => {
    const trip: Trip = {
      ...input,
      id: randomUUID(),
      syncVersion: 0,
      updatedAt: new Date().toISOString(),
    };
    setTrips((current) => [trip, ...current]);
    setPending((current) =>
      mergeJournalMutation(current, {
        baseVersion: 0,
        entityId: trip.id,
        kind: 'trip-upsert',
        mutationId: randomUUID(),
        trip,
      }),
    );
    return trip;
  }, []);

  const deleteEntry = useCallback(
    (entryId: string) => {
      const entry = stateRef.current.entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.deletedAt) return;
      const now = new Date().toISOString();
      persistEntrySnapshot({ ...entry, deletedAt: now, updatedAt: now });
    },
    [persistEntrySnapshot],
  );

  const restoreEntry = useCallback(
    (entryId: string) => {
      const entry = stateRef.current.entries.find((candidate) => candidate.id === entryId);
      // Once its 30 days are over the entry is being deleted for good (here and by the API).
      if (!entry?.deletedAt || isExpired(entry.deletedAt)) return false;
      persistEntrySnapshot({ ...entry, deletedAt: null, updatedAt: new Date().toISOString() });
      return true;
    },
    [persistEntrySnapshot],
  );

  const deleteEntriesForever = useCallback(
    (entryIds: string[]) => {
      const next = queuePermanentDeletes(stateRef.current, entryIds);
      if (next === stateRef.current) return;
      stateRef.current = next;
      setEntries(next.entries);
      setPending(next.pending);
      if (user && loadedUserRef.current === user.id) void writeLocalJson(journalStorageKey(user.id), next);
    },
    [user],
  );

  // Entries deleted more than 30 days ago are deleted for good. The API does this on the server
  // too, so it also happens when the app is not opened.
  useEffect(() => {
    if (!hydrated || !user || loadedUserRef.current !== user.id) return;
    const expired = expiredIds(entries);
    if (expired.length > 0) deleteEntriesForever(expired);
  }, [deleteEntriesForever, entries, hydrated, user]);

  const deleteTrip = useCallback(
    (tripId: string) => {
      const trip = trips.find((candidate) => candidate.id === tripId);
      if (!trip) return;
      setTrips((current) => current.filter((candidate) => candidate.id !== tripId));
      setEntries((current) => current.map((entry) => (entry.tripId === tripId ? { ...entry, tripId: null } : entry)));
      setPending((current) => {
        const unlinked = current.map((mutation) =>
          mutation.kind === 'entry-upsert' && mutation.entry.tripId === tripId
            ? { ...mutation, entry: { ...mutation.entry, tripId: null } }
            : mutation,
        );
        const unsyncedCreate = unlinked.find(
          (mutation) => mutation.kind === 'trip-upsert' && mutation.entityId === tripId && mutation.baseVersion === 0,
        );
        if (unsyncedCreate) return unlinked.filter((mutation) => mutation.entityId !== tripId);
        return mergeJournalMutation(unlinked, {
          baseVersion: trip.syncVersion ?? 0,
          entityId: tripId,
          kind: 'trip-delete',
          mutationId: randomUUID(),
        });
      });
    },
    [trips],
  );

  const updateEntry = useCallback(
    (entryId: string, changes: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>) => {
      const entry = stateRef.current.entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      const normalizedChanges = changes.todoItems
        ? {
            ...changes,
            todoItems: changes.todoItems.map((item) => ({
              ...item,
              id: uuidPattern.test(item.id) ? item.id : randomUUID(),
            })),
          }
        : changes;
      const nextEntry = { ...entry, ...normalizedChanges, updatedAt: new Date().toISOString() };
      persistEntrySnapshot(nextEntry);
    },
    [persistEntrySnapshot],
  );

  const toggleFavorite = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      const nextEntry = { ...entry, favorite: !entry.favorite, updatedAt: new Date().toISOString() };
      setEntries((current) => current.map((candidate) => (candidate.id === entryId ? nextEntry : candidate)));
      queueEntry(nextEntry);
    },
    [entries, queueEntry],
  );

  const toggleReviewed = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      const nextEntry = { ...entry, reviewed: !entry.reviewed, updatedAt: new Date().toISOString() };
      setEntries((current) => current.map((candidate) => (candidate.id === entryId ? nextEntry : candidate)));
      queueEntry(nextEntry);
    },
    [entries, queueEntry],
  );

  const toggleTodoItem = useCallback(
    (entryId: string, todoItemId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      const toggled = toggleEntryTodo(entry, todoItemId);
      if (!toggled) return;
      const nextEntry = { ...entry, ...toggled, updatedAt: new Date().toISOString() };
      setEntries((current) => current.map((candidate) => (candidate.id === entryId ? nextEntry : candidate)));
      queueEntry(nextEntry);
    },
    [entries, queueEntry],
  );

  const toggleSectionExpanded = useCallback((sectionId: JournalSectionId) => {
    setExpandedSectionIds((current) => {
      const expanded = current.includes(sectionId);
      const next = expanded ? current.filter((id) => id !== sectionId) : [...current, sectionId];
      setPending((mutations) =>
        mergeJournalMutation(mutations, {
          collapsed: expanded,
          entityId: sectionId,
          kind: 'section-update',
          mutationId: randomUUID(),
        }),
      );
      return next;
    });
  }, []);

  // Finds deleted entries too, so Recently Deleted can show them.
  const getEntry = useCallback(
    (entryId: string | undefined) => entries.find((entry) => entry.id === entryId),
    [entries],
  );
  const visibleEntries = useMemo(() => liveEntries(entries), [entries]);
  const recentlyDeleted = useMemo(() => deletedEntriesOf(entries), [entries]);
  const dismissSyncIssue = useCallback(
    (issueId: string) => setSyncIssues((current) => current.filter((issue) => issue.id !== issueId)),
    [],
  );
  const retrySync = useCallback(() => {
    pulledUserRef.current = null;
    attemptedPendingRef.current = null;
    setSyncStatus(isOnline ? 'syncing' : 'offline');
    setRetryNonce((value) => value + 1);
  }, [isOnline]);
  const ready = hydrated && (!user || loadedUserId === user.id);

  const value = useMemo<JournalContextValue>(
    () => ({
      createEntry,
      createFolder,
      deleteFolder,
      folders,
      createTrip,
      deleteEntry,
      deleteEntriesForever,
      deletedEntries: recentlyDeleted,
      deleteTrip,
      dismissSyncIssue,
      entries: visibleEntries,
      expandedSectionIds,
      getEntry,
      pendingChangeCount: pending.length,
      ready,
      restoreEntry,
      retrySync,
      syncIssues,
      syncStatus: !isOnline ? 'offline' : syncStatus,
      toggleFavorite,
      toggleReviewed,
      toggleSectionExpanded,
      toggleTodoItem,
      trips,
      updateEntry,
    }),
    [
      createEntry,
      createFolder,
      createTrip,
      deleteEntry,
      deleteEntriesForever,
      deleteFolder,
      deleteTrip,
      dismissSyncIssue,
      expandedSectionIds,
      folders,
      getEntry,
      pending.length,
      ready,
      recentlyDeleted,
      restoreEntry,
      retrySync,
      visibleEntries,
      isOnline,
      syncIssues,
      syncStatus,
      toggleFavorite,
      toggleReviewed,
      toggleSectionExpanded,
      toggleTodoItem,
      trips,
      updateEntry,
    ],
  );

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal() {
  const context = useContext(JournalContext);
  if (!context) throw new Error('useJournal must be used within JournalProvider');
  return context;
}
