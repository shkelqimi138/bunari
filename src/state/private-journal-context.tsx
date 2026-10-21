// Private journal provider: setup, unlock, encryption, protected folders, and sync
import { randomUUID } from 'expo-crypto';
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import {
  loadPrivateJournal,
  mergePrivateMutation,
  removePrivateRecords,
  reconcilePrivateSync,
  type PersistedPrivateJournal,
  type PrivateSyncIssue,
  savePrivateJournal,
  synchronizePrivateJournal,
} from '@/data/private-sync';
import { mediaCache } from '@/data/media-cache';
import { todosForNewEntry, toggleEntryTodo } from '@/domain/checklist';
import type { JournalEntry } from '@/domain/journal';
import { deletedEntries as deletedEntriesOf, expiredIds, isExpired, liveEntries } from '@/domain/recently-deleted';
import { hasStorageLimitIssue } from '@/domain/storage-limits';
import { useIsOnline } from '@/hooks/use-is-online';
import { supabase } from '@/lib/supabase';
import {
  decryptPrivateJson,
  encryptPrivateJson,
  generatePrivateMasterKey,
  generateRecoveryKey,
  normalizedRecoveryKey,
  unwrapPrivateMasterKey,
  wrapPrivateMasterKey,
  type WrappedPrivateKey,
} from '@/security/private-crypto';
import { privateKeyStore, type PrivateDeviceConfiguration } from '@/security/private-key-store';
import { noPinAttempts, pinLockoutMessage, recordPinFailure } from '@/security/pin-attempts';
import {
  hasLegacyCiphertext,
  normalizeCiphertext,
  sealedValueProblem,
  wrappedKeyProblem,
} from '@/security/sealed-value';
import { useAuth } from '@/state/auth-context';
import type { NewEntryInput } from '@/state/journal-context';

type PrivateStatus = 'loading' | 'setup' | 'locked' | 'unlocked' | 'unsupported';
type PrivateSyncStatus = 'idle' | 'offline' | 'syncing' | 'error';
type SetupResult = { error: string | null; recoveryKey: string | null };
type ActionResult = { error: string | null };
type PrivateEntryPayload = Omit<
  JournalEntry,
  'createdAt' | 'deletedAt' | 'id' | 'sectionId' | 'syncVersion' | 'updatedAt'
>;
// A protected folder is stored as its own encrypted record, so its name never
// leaves the device unencrypted. Entries point to it with `folderId`.
type ProtectedFolderPayload = { emoji: string; kind: 'folder'; name: string };
export type ProtectedFolder = { createdAt: string; emoji: string; id: string; name: string; syncVersion: number };

function isFolderPayload(payload: PrivateEntryPayload | ProtectedFolderPayload): payload is ProtectedFolderPayload {
  return 'kind' in payload && payload.kind === 'folder';
}

type PrivateJournalContextValue = {
  biometricAvailable: boolean;
  configuration: PrivateDeviceConfiguration | null;
  changePin: (currentPin: string, newPin: string) => Promise<ActionResult>;
  createEntry: (input: NewEntryInput) => Promise<JournalEntry>;
  createProtectedFolder: (name: string, emoji: string) => Promise<ActionResult>;
  deleteProtectedFolder: (folderId: string) => Promise<void>;
  protectedFolders: ProtectedFolder[];
  // Moves the entry to Recently Deleted; it can be restored for 30 days.
  deleteEntry: (entryId: string) => Promise<void>;
  // Deletes entries for good (Delete now, Delete all, and the 30-day cleanup).
  deleteEntriesForever: (entryIds: string[]) => void;
  // Deleted entries, the most recently deleted first; empty while Private is locked.
  deletedEntries: JournalEntry[];
  // How many entries are in Recently Deleted, known even while Private is locked. While unlocked it
  // counts only the entries that could be opened, so it matches what Recently Deleted lists.
  deletedRecordCount: number;
  // Entries that are not deleted.
  entries: JournalEntry[];
  getEntry: (entryId: string | undefined) => JournalEntry | undefined;
  lock: () => void;
  dismissSyncIssue: (issueId: string) => void;
  pendingChangeCount: number;
  retrySync: () => void;
  syncIssues: PrivateSyncIssue[];
  syncStatus: PrivateSyncStatus;
  recover: (recoveryKey: string, pin: string, biometric: boolean) => Promise<ActionResult>;
  resetPinWithBiometrics: (newPin: string) => Promise<ActionResult>;
  // Resolves false when Private is locked, the entry is not in Recently Deleted, or its 30 days are over.
  restoreEntry: (entryId: string) => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => Promise<ActionResult>;
  setup: (pin: string, biometric: boolean) => Promise<SetupResult>;
  status: PrivateStatus;
  toggleFavorite: (entryId: string) => Promise<void>;
  toggleReviewed: (entryId: string) => Promise<void>;
  toggleTodoItem: (entryId: string, todoItemId: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<ActionResult>;
  unlockWithPin: (pin: string) => Promise<ActionResult>;
  updateEntry: (entryId: string, changes: Partial<Omit<JournalEntry, 'createdAt' | 'id'>>) => Promise<void>;
};

const PrivateJournalContext = createContext<PrivateJournalContextValue | null>(null);
const entryContext = 'private-entry:v1';
const emptyJournal: PersistedPrivateJournal = { pending: [], records: [], version: 1 };
const unreadableIssueId = 'private-unreadable-entries';

// Oldest first, so a new protected folder appears under the last one created.
function sortProtectedFolders(folders: ProtectedFolder[]) {
  return [...folders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function openFailure(error: unknown) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
  return `Private could not be opened.${detail}`;
}

// Keeps one up-to-date issue listing entries that could not be decrypted. The
// entries stay stored and synchronized unchanged; they are only left out of view.
function withUnreadableIssue(journal: PersistedPrivateJournal, unreadable: string[]): PersistedPrivateJournal {
  const issues = journal.syncIssues ?? [];
  const others = issues.filter((issue) => issue.id !== unreadableIssueId);
  if (unreadable.length === 0) return others.length === issues.length ? journal : { ...journal, syncIssues: others };
  const count = unreadable.length;
  const message = `${count} Private ${count === 1 ? 'entry' : 'entries'} could not be opened and ${count === 1 ? 'was' : 'were'} kept unchanged (${unreadable.join('; ')}).`;
  if (issues.some((issue) => issue.id === unreadableIssueId && issue.message === message)) return journal;
  return {
    ...journal,
    syncIssues: [{ createdAt: new Date().toISOString(), id: unreadableIssueId, kind: 'error', message }, ...others],
  };
}

function recoveryContext(userId: string) {
  return `private-master:v1:${userId}:recovery`;
}
function pinContext(userId: string) {
  return `private-master:v1:${userId}:pin`;
}

function payloadFromEntry(entry: JournalEntry): PrivateEntryPayload {
  // The deletion time stays outside the encrypted payload, next to the entry's other dates.
  const {
    createdAt: _createdAt,
    deletedAt: _deletedAt,
    id: _id,
    sectionId: _sectionId,
    syncVersion: _syncVersion,
    updatedAt: _updatedAt,
    ...payload
  } = entry;
  return payload;
}

export function PrivateJournalProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [status, setStatus] = useState<PrivateStatus>('loading');
  const [configuration, setConfiguration] = useState<PrivateDeviceConfiguration | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [journal, setJournal] = useState<PersistedPrivateJournal>(emptyJournal);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [protectedFolders, setProtectedFolders] = useState<ProtectedFolder[]>([]);
  const biometricPromptRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [privateSyncStatus, setPrivateSyncStatus] = useState<PrivateSyncStatus>('idle');
  const masterKeyRef = useRef<string | null>(null);
  const journalRef = useRef<PersistedPrivateJournal>(emptyJournal);
  const syncingRef = useRef(false);
  const attemptedPendingRef = useRef<string | null>(null);
  const pulledUserRef = useRef<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);
  const relockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    masterKeyRef.current = null;
    setEntries([]);
    setProtectedFolders([]);
    setStatus((current) => (current === 'unlocked' ? 'locked' : current));
    if (relockTimerRef.current) clearTimeout(relockTimerRef.current);
  }, []);

  const scheduleRelock = useCallback(() => {
    if (relockTimerRef.current) clearTimeout(relockTimerRef.current);
    relockTimerRef.current = setTimeout(lock, 5 * 60 * 1000);
  }, [lock]);

  const decryptRecords = useCallback(async (nextJournal: PersistedPrivateJournal, masterKey: string) => {
    // Each entry is opened separately so one damaged record cannot block the rest.
    const unreadable: string[] = [];
    const folders: ProtectedFolder[] = [];
    const opened = await Promise.all(
      nextJournal.records.map(async (record) => {
        try {
          const payload = await decryptPrivateJson<PrivateEntryPayload | ProtectedFolderPayload>(
            record,
            masterKey,
            entryContext,
          );
          if (isFolderPayload(payload)) {
            folders.push({
              createdAt: record.createdAt,
              emoji: payload.emoji,
              id: record.id,
              name: payload.name,
              syncVersion: record.syncVersion,
            });
            return null;
          }
          return {
            ...payload,
            createdAt: record.createdAt,
            deletedAt: record.deletedAt ?? null,
            id: record.id,
            sectionId: 'private' as const,
            syncVersion: record.syncVersion,
            updatedAt: record.updatedAt,
          };
        } catch {
          const problem = sealedValueProblem(record) ?? 'it could not be decrypted with this Private key';
          unreadable.push(`entry ${record.id.slice(0, 8)} from ${record.createdAt.slice(0, 10)}: ${problem}`);
          return null;
        }
      }),
    );
    const decrypted = opened.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    let migratedJournal = nextJournal;
    // Records saved in the earlier byte-object format are re-saved as base64 (the same
    // encrypted bytes) and uploaded again, so Supabase holds them correctly too.
    const unreadableIds = new Set(unreadable.map((line) => line.split(' ')[1]));
    for (const record of nextJournal.records) {
      if (!hasLegacyCiphertext(record) || unreadableIds.has(record.id.slice(0, 8))) continue;
      const repaired = { ...record, ciphertext: normalizeCiphertext(record.ciphertext)! };
      migratedJournal = {
        ...migratedJournal,
        pending: mergePrivateMutation(migratedJournal.pending, {
          baseVersion: record.syncVersion ?? 0,
          kind: 'upsert',
          mutationId: randomUUID(),
          record: repaired,
        }),
        records: migratedJournal.records.map((item) => (item.id === record.id ? repaired : item)),
      };
    }
    const migratedEntries = await Promise.all(
      decrypted.map(async (entry) => {
        let changed = false;
        let coverUri = entry.coverUri;
        if (coverUri && !coverUri.startsWith('data:')) {
          try {
            coverUri = await mediaCache.privateDataUri(coverUri, entry.coverMimeType ?? 'image/jpeg');
            changed = true;
          } catch {
            /* The original local reference remains available on this device. */
          }
        }
        const attachments = await Promise.all(
          entry.attachments.map(async (attachment) => {
            if (attachment.uri.startsWith('data:')) return attachment;
            try {
              const uri = await mediaCache.privateDataUri(attachment.uri, attachment.mimeType ?? 'image/jpeg');
              changed = true;
              return { ...attachment, uri };
            } catch {
              return attachment;
            }
          }),
        );
        if (!changed) return entry;
        const updated = { ...entry, attachments, coverUri, updatedAt: new Date().toISOString() };
        const sealed = await encryptPrivateJson(payloadFromEntry(updated), masterKey, entryContext);
        const record = {
          ...sealed,
          createdAt: updated.createdAt,
          deletedAt: updated.deletedAt ?? null,
          id: updated.id,
          syncVersion: updated.syncVersion ?? 0,
          updatedAt: updated.updatedAt,
        };
        migratedJournal = {
          ...migratedJournal,
          pending: mergePrivateMutation(migratedJournal.pending, {
            baseVersion: updated.syncVersion ?? 0,
            kind: 'upsert',
            mutationId: randomUUID(),
            record,
          }),
          records: [record, ...migratedJournal.records.filter((item) => item.id !== updated.id)],
        };
        return updated;
      }),
    );
    if (migratedJournal !== nextJournal) setJournal(migratedJournal);
    setJournal((current) => withUnreadableIssue(current, unreadable));
    setProtectedFolders(sortProtectedFolders(folders));
    setEntries(migratedEntries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }, []);

  useEffect(() => {
    const userId = user?.id;
    let active = true;
    loadedUserRef.current = null;
    pulledUserRef.current = null;
    masterKeyRef.current = null;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setEntries([]);
      if (!userId) {
        setConfiguration(null);
        setJournal(emptyJournal);
        setStatus('loading');
        return;
      }
      if (Platform.OS !== 'ios') {
        setStatus('unsupported');
        loadedUserRef.current = userId;
        return;
      }

      try {
        const [savedConfiguration, hasBiometrics, savedJournal, envelopeResult] = await Promise.all([
          privateKeyStore.getConfiguration(userId),
          privateKeyStore.isBiometricAvailable(),
          loadPrivateJournal(userId),
          supabase.from('private_key_envelopes').select('user_id').eq('user_id', userId).maybeSingle(),
        ]);
        if (!active) return;
        setConfiguration(savedConfiguration);
        setBiometricAvailable(hasBiometrics);
        setJournal(savedJournal);
        loadedUserRef.current = userId;
        setStatus(savedConfiguration || envelopeResult.data ? 'locked' : 'setup');
      } catch {
        if (active) setStatus('locked');
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || loadedUserRef.current !== user.id || Platform.OS !== 'ios') return;
    const timer = setTimeout(() => void savePrivateJournal(user.id, journal), 150);
    return () => clearTimeout(timer);
  }, [journal, user]);

  useEffect(() => {
    journalRef.current = journal;
  }, [journal]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // A Face ID prompt shown for a PIN reset makes the app briefly inactive; that must not lock Private.
      if (nextState !== 'active') {
        if (!biometricPromptRef.current) lock();
      } else {
        pulledUserRef.current = null;
        // Coming back always tries once more, also while a storage limit has paused the retries
        // every few seconds (code review, 2026-10-08).
        attemptedPendingRef.current = null;
        setRetryNonce((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, [lock]);

  useEffect(
    () => () => {
      if (relockTimerRef.current) clearTimeout(relockTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isOnline) {
      attemptedPendingRef.current = null;
      return;
    }
    if (!user || loadedUserRef.current !== user.id || syncingRef.current || status === 'loading' || status === 'setup')
      return;
    if (journal.pending.length === 0 && pulledUserRef.current === user.id) return;
    const pendingSignature = journal.pending.map((mutation) => mutation.mutationId).join(':');
    if (journal.pending.length > 0 && attemptedPendingRef.current === pendingSignature) return;
    attemptedPendingRef.current = pendingSignature;
    syncingRef.current = true;
    const snapshot = journal;
    setPrivateSyncStatus('syncing');
    void synchronizePrivateJournal(user.id, snapshot)
      .then(async (result) => {
        const reconciled = reconcilePrivateSync(journalRef.current, snapshot, result);
        setJournal(reconciled);
        pulledUserRef.current = user.id;
        if (masterKeyRef.current) await decryptRecords(reconciled, masterKeyRef.current);
        setPrivateSyncStatus(reconciled.pending.length > 0 ? 'error' : 'idle');
        if (reconciled.pending.length === 0) attemptedPendingRef.current = null;
        if (reconciled.pending.length > 0 && !hasStorageLimitIssue(reconciled.syncIssues ?? []))
          setTimeout(() => {
            attemptedPendingRef.current = null;
            setRetryNonce((value) => value + 1);
          }, 5000);
      })
      .catch((caught) => {
        const message =
          caught instanceof Error && caught.message
            ? `Private sync could not reach encrypted journal data. ${caught.message}`
            : 'Private sync could not reach encrypted journal data. Your changes remain safely on this device.';
        setJournal((current) => ({
          ...current,
          syncIssues: [
            {
              createdAt: new Date().toISOString(),
              id: randomUUID(),
              kind: 'error',
              message,
            },
            ...(current.syncIssues ?? []).filter((issue) => issue.kind !== 'error'),
          ],
        }));
        setPrivateSyncStatus('error');
        setTimeout(() => {
          attemptedPendingRef.current = null;
          setRetryNonce((value) => value + 1);
        }, 5000);
      })
      .finally(() => {
        syncingRef.current = false;
      });
  }, [decryptRecords, isOnline, journal, retryNonce, status, user]);

  const saveDeviceAccess = useCallback(async (userId: string, masterKey: string, pin: string, biometric: boolean) => {
    const pinEnvelope = pin ? await wrapPrivateMasterKey(masterKey, pin, pinContext(userId)) : null;
    const nextConfiguration: PrivateDeviceConfiguration = {
      biometricEnabled: biometric,
      pinEnabled: Boolean(pinEnvelope),
      pinEnvelope,
    };
    if (biometric) await privateKeyStore.saveBiometricKey(userId, masterKey);
    await privateKeyStore.saveConfiguration(userId, nextConfiguration);
    setConfiguration(nextConfiguration);
  }, []);

  // Re-saves the PIN envelope (this device) and the recovery envelope (Supabase) when they
  // still use the earlier byte-object format; the encrypted bytes do not change.
  const repairLegacyEnvelopes = useCallback(async (userId: string) => {
    try {
      const saved = await privateKeyStore.getConfiguration(userId);
      if (saved?.pinEnvelope && hasLegacyCiphertext(saved.pinEnvelope)) {
        const repaired = {
          ...saved,
          pinEnvelope: { ...saved.pinEnvelope, ciphertext: normalizeCiphertext(saved.pinEnvelope.ciphertext)! },
        };
        await privateKeyStore.saveConfiguration(userId, repaired);
        setConfiguration(repaired);
      }
      const { data } = await supabase
        .from('private_key_envelopes')
        .select('wrapped_master_key')
        .eq('user_id', userId)
        .maybeSingle();
      if (data && hasLegacyCiphertext({ ciphertext: data.wrapped_master_key })) {
        await supabase
          .from('private_key_envelopes')
          .update({ wrapped_master_key: normalizeCiphertext(data.wrapped_master_key) })
          .eq('user_id', userId);
      }
    } catch {
      /* Retried on the next unlock. */
    }
  }, []);

  const unlock = useCallback(
    async (masterKey: string) => {
      masterKeyRef.current = masterKey;
      await decryptRecords(journal, masterKey);
      setStatus('unlocked');
      scheduleRelock();
      // Any successful unlock (PIN, Face ID, or recovery key) clears wrong-PIN attempts.
      if (user) await privateKeyStore.savePinAttempts(user.id, noPinAttempts).catch(() => undefined);
      if (user) void repairLegacyEnvelopes(user.id);
    },
    [decryptRecords, journal, repairLegacyEnvelopes, scheduleRelock, user],
  );

  const setup = useCallback(
    async (pin: string, biometric: boolean): Promise<SetupResult> => {
      if (!user) return { error: 'Sign in before setting up Private.', recoveryKey: null };
      if (!/^\d{6,}$/.test(pin)) return { error: 'Use a PIN with at least 6 digits.', recoveryKey: null };
      if (biometric && !biometricAvailable)
        return { error: 'Face ID is not available on this device.', recoveryKey: null };
      try {
        const masterKey = await generatePrivateMasterKey();
        const recoveryKey = generateRecoveryKey();
        const envelope = await wrapPrivateMasterKey(masterKey, recoveryKey, recoveryContext(user.id));
        const verifiedMasterKey = await unwrapPrivateMasterKey(envelope, recoveryKey, recoveryContext(user.id));
        const probe = await encryptPrivateJson({ verified: true }, verifiedMasterKey, entryContext);
        const verification = await decryptPrivateJson<{ verified: boolean }>(probe, masterKey, entryContext);
        if (verifiedMasterKey !== masterKey || !verification.verified)
          throw new Error('Private encryption verification failed.');
        const { error } = await supabase.from('private_key_envelopes').upsert({
          encryption_version: 1,
          kdf: envelope.kdf,
          kdf_parameters: envelope.kdfParameters,
          recovery_salt: envelope.salt,
          user_id: user.id,
          wrapped_master_key: envelope.ciphertext,
          wrapping_nonce: envelope.nonce,
        });
        if (error) throw error;
        await saveDeviceAccess(user.id, masterKey, pin, biometric);
        await unlock(masterKey);
        return { error: null, recoveryKey };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Private setup failed.', recoveryKey: null };
      }
    },
    [biometricAvailable, saveDeviceAccess, unlock, user],
  );

  const unlockWithPin = useCallback(
    async (pin: string): Promise<ActionResult> => {
      if (!user || !configuration?.pinEnvelope) return { error: 'PIN unlock is not configured.' };
      let masterKey: string;
      const damage = wrappedKeyProblem(configuration.pinEnvelope);
      if (damage)
        return {
          error: `The PIN data on this iPhone is damaged (${damage}). Unlock with Face ID or your recovery key, then set a new PIN.`,
        };
      const attempts = await privateKeyStore.getPinAttempts(user.id);
      const lockout = pinLockoutMessage(attempts, Date.now());
      if (lockout) return { error: lockout };
      try {
        masterKey = await unwrapPrivateMasterKey(configuration.pinEnvelope, pin, pinContext(user.id));
      } catch {
        const next = recordPinFailure(attempts, Date.now());
        await privateKeyStore.savePinAttempts(user.id, next);
        const nextLockout = pinLockoutMessage(next, Date.now());
        if (nextLockout) return { error: nextLockout };
        return {
          error: configuration.biometricEnabled
            ? 'Incorrect PIN. Forgot it? Unlock with Face ID, then choose Change PIN in Account.'
            : 'Incorrect PIN. Forgot it? Use your recovery key to choose a new PIN.',
        };
      }
      try {
        await unlock(masterKey);
        return { error: null };
      } catch (error) {
        return { error: openFailure(error) };
      }
    },
    [configuration, unlock, user],
  );

  const changePin = useCallback(
    async (currentPin: string, newPin: string): Promise<ActionResult> => {
      if (!user || !configuration?.pinEnvelope) return { error: 'PIN unlock is not configured.' };
      if (status !== 'unlocked' || !masterKeyRef.current) return { error: 'Unlock Private before changing its PIN.' };
      if (!/^\d{6,}$/.test(newPin)) return { error: 'Use a new PIN with at least 6 digits.' };
      if (currentPin === newPin) return { error: 'Choose a PIN different from the current one.' };
      try {
        const verifiedKey = await unwrapPrivateMasterKey(configuration.pinEnvelope, currentPin, pinContext(user.id));
        if (verifiedKey !== masterKeyRef.current) return { error: 'Incorrect current PIN.' };
        await saveDeviceAccess(user.id, verifiedKey, newPin, configuration.biometricEnabled);
        scheduleRelock();
        return { error: null };
      } catch {
        return { error: 'Incorrect current PIN.' };
      }
    },
    [configuration, saveDeviceAccess, scheduleRelock, status, user],
  );

  // For a forgotten PIN: Face ID proves access, so no current PIN is needed.
  const resetPinWithBiometrics = useCallback(
    async (newPin: string): Promise<ActionResult> => {
      if (!user || !configuration?.biometricEnabled)
        return { error: 'Face ID unlock is not set up. Use your recovery key to choose a new PIN.' };
      const masterKey = masterKeyRef.current;
      if (status !== 'unlocked' || !masterKey) return { error: 'Unlock Private before resetting its PIN.' };
      if (!/^\d{6,}$/.test(newPin)) return { error: 'Use a new PIN with at least 6 digits.' };
      let biometricKey: string | null;
      biometricPromptRef.current = true;
      try {
        biometricKey = await privateKeyStore.getBiometricKey(user.id);
      } catch {
        return { error: 'Face ID was not completed.' };
      } finally {
        biometricPromptRef.current = false;
      }
      if (biometricKey !== masterKey)
        return { error: 'Face ID key is unavailable. Use your recovery key to choose a new PIN.' };
      try {
        await saveDeviceAccess(user.id, biometricKey, newPin, true);
        scheduleRelock();
        return { error: null };
      } catch {
        return { error: 'The new PIN could not be saved.' };
      }
    },
    [configuration, saveDeviceAccess, scheduleRelock, status, user],
  );

  const unlockWithBiometrics = useCallback(async (): Promise<ActionResult> => {
    if (!user || !configuration?.biometricEnabled) return { error: 'Face ID unlock is not configured.' };
    let masterKey: string | null;
    try {
      masterKey = await privateKeyStore.getBiometricKey(user.id);
    } catch {
      return { error: 'Face ID was not completed.' };
    }
    if (!masterKey) return { error: 'Face ID key is unavailable. Use your PIN or recovery key.' };
    try {
      await unlock(masterKey);
      return { error: null };
    } catch (error) {
      return { error: openFailure(error) };
    }
  }, [configuration, unlock, user]);

  const recover = useCallback(
    async (recoveryKey: string, pin: string, biometric: boolean): Promise<ActionResult> => {
      if (!user) return { error: 'Sign in before recovering Private.' };
      if (!/^\d{6,}$/.test(pin)) return { error: 'Use a new PIN with at least 6 digits.' };
      if (normalizedRecoveryKey(recoveryKey).length !== 64) return { error: 'Recovery key is incomplete.' };
      const { data, error } = await supabase
        .from('private_key_envelopes')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return { error: 'Your recovery data could not be reached. Check your connection and try again.' };
      if (!data) return { error: 'No Private recovery data was found for this account.' };
      let masterKey: string;
      try {
        const envelope: WrappedPrivateKey = {
          ciphertext: data.wrapped_master_key,
          kdf: data.kdf,
          kdfParameters: data.kdf_parameters,
          nonce: data.wrapping_nonce,
          salt: data.recovery_salt,
          version: data.encryption_version,
        };
        masterKey = await unwrapPrivateMasterKey(envelope, recoveryKey, recoveryContext(user.id));
      } catch {
        return { error: 'Recovery key is incorrect.' };
      }
      try {
        await saveDeviceAccess(user.id, masterKey, pin, biometric && biometricAvailable);
        await unlock(masterKey);
        return { error: null };
      } catch (error) {
        return { error: openFailure(error) };
      }
    },
    [biometricAvailable, saveDeviceAccess, unlock, user],
  );

  const setBiometricEnabled = useCallback(
    async (enabled: boolean): Promise<ActionResult> => {
      if (!user || !configuration) return { error: 'Set up Private before changing Face ID.' };
      if (enabled && !biometricAvailable) return { error: 'Face ID is not available on this device.' };
      const masterKey = masterKeyRef.current;
      if (enabled && (!masterKey || status !== 'unlocked')) return { error: 'Unlock Private before enabling Face ID.' };
      try {
        if (enabled) await privateKeyStore.saveBiometricKey(user.id, masterKey!);
        else await privateKeyStore.deleteBiometricKey(user.id);
        const nextConfiguration = { ...configuration, biometricEnabled: enabled };
        await privateKeyStore.saveConfiguration(user.id, nextConfiguration);
        await supabase.from('user_settings').update({ face_id_enabled: enabled }).eq('user_id', user.id);
        setConfiguration(nextConfiguration);
        return { error: null };
      } catch {
        return { error: 'Face ID setting could not be changed.' };
      }
    },
    [biometricAvailable, configuration, status, user],
  );

  const saveRecord = useCallback(
    async (
      meta: { createdAt: string; deletedAt?: string | null; id: string; syncVersion?: number; updatedAt: string },
      payload: PrivateEntryPayload | ProtectedFolderPayload,
    ) => {
      const masterKey = masterKeyRef.current;
      if (!masterKey || !user) throw new Error('Private is locked.');
      scheduleRelock();
      const sealed = await encryptPrivateJson(payload, masterKey, entryContext);
      const record = {
        ...sealed,
        createdAt: meta.createdAt,
        deletedAt: meta.deletedAt ?? null,
        id: meta.id,
        syncVersion: meta.syncVersion ?? 0,
        updatedAt: meta.updatedAt,
      };
      const current = journalRef.current;
      const next: PersistedPrivateJournal = {
        ...current,
        pending: mergePrivateMutation(current.pending, {
          baseVersion: meta.syncVersion ?? 0,
          kind: 'upsert',
          mutationId: randomUUID(),
          record,
        }),
        records: [record, ...current.records.filter((candidate) => candidate.id !== meta.id)],
      };
      journalRef.current = next;
      setJournal(next);
      await savePrivateJournal(user.id, next);
    },
    [scheduleRelock, user],
  );

  const saveEntry = useCallback(
    async (entry: JournalEntry) => {
      await saveRecord(entry, payloadFromEntry(entry));
      setEntries((current) => [entry, ...current.filter((candidate) => candidate.id !== entry.id)]);
    },
    [saveRecord],
  );

  // Removes records for good and queues their deletion on the server. Needs no key, so the
  // 30-day cleanup also works while Private is locked.
  const removeRecords = useCallback((records: { id: string; syncVersion?: number }[]) => {
    if (records.length === 0) return;
    setJournal((current) => removePrivateRecords(current, records));
    const ids = new Set(records.map((record) => record.id));
    setEntries((current) => current.filter((entry) => !ids.has(entry.id)));
  }, []);

  const deleteRecord = useCallback(
    (recordId: string, syncVersion: number) => {
      scheduleRelock();
      removeRecords([{ id: recordId, syncVersion }]);
    },
    [removeRecords, scheduleRelock],
  );

  const createEntry = useCallback(
    async (input: NewEntryInput) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      const entry: JournalEntry = {
        ...input,
        attachments: input.attachments ?? [],
        coverUri: input.coverUri ?? null,
        createdAt: now,
        favorite: false,
        id,
        latitude: input.latitude ?? null,
        locationLabel: input.locationLabel ?? null,
        longitude: input.longitude ?? null,
        mood: null,
        reviewed: false,
        sectionId: 'private',
        syncVersion: 0,
        todoItems: todosForNewEntry(id, input.body, input.todoItems, randomUUID),
        updatedAt: now,
      };
      await saveEntry(entry);
      return entry;
    },
    [saveEntry],
  );

  const updateEntry = useCallback(
    async (entryId: string, changes: Partial<Omit<JournalEntry, 'createdAt' | 'id'>>) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      await saveEntry({ ...entry, ...changes, updatedAt: new Date().toISOString() });
    },
    [entries, saveEntry],
  );

  const deleteEntry = useCallback(
    async (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.deletedAt) return;
      const now = new Date().toISOString();
      await saveEntry({ ...entry, deletedAt: now, updatedAt: now });
    },
    [entries, saveEntry],
  );

  const restoreEntry = useCallback(
    async (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      // Once its 30 days are over the entry is being deleted for good (here and by the API).
      if (!masterKeyRef.current || !entry?.deletedAt || isExpired(entry.deletedAt)) return false;
      await saveEntry({ ...entry, deletedAt: null, updatedAt: new Date().toISOString() });
      return true;
    },
    [entries, saveEntry],
  );

  const deleteEntriesForever = useCallback(
    (entryIds: string[]) => {
      const ids = new Set(entryIds);
      const records = journalRef.current.records.filter((record) => ids.has(record.id));
      if (records.length === 0) return;
      scheduleRelock();
      removeRecords(records);
    },
    [removeRecords, scheduleRelock],
  );

  // Entries deleted more than 30 days ago are deleted for good, also while Private is locked.
  // The API does this on the server too, so it also happens when the app is not opened.
  useEffect(() => {
    if (!user || loadedUserRef.current !== user.id || Platform.OS !== 'ios') return;
    const expired = new Set(expiredIds(journal.records));
    removeRecords(journal.records.filter((record) => expired.has(record.id)));
  }, [journal.records, removeRecords, user]);

  const createProtectedFolder = useCallback(
    async (name: string, emoji: string): Promise<ActionResult> => {
      // The key, not the status, is checked: a caller may have just unlocked Private.
      if (!masterKeyRef.current) return { error: 'Unlock Private before creating a protected folder.' };
      const trimmed = name.trim();
      if (!trimmed) return { error: 'Give the folder a name.' };
      const now = new Date().toISOString();
      const folder: ProtectedFolder = {
        createdAt: now,
        emoji: emoji.trim() || '🔐',
        id: randomUUID(),
        name: trimmed,
        syncVersion: 0,
      };
      try {
        await saveRecord({ ...folder, updatedAt: now }, { emoji: folder.emoji, kind: 'folder', name: folder.name });
        setProtectedFolders((current) => sortProtectedFolders([...current, folder]));
        return { error: null };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'The folder could not be created.' };
      }
    },
    [saveRecord],
  );

  // Entries of a deleted protected folder stay encrypted in the Private root.
  const deleteProtectedFolder = useCallback(
    async (folderId: string) => {
      const folder = protectedFolders.find((candidate) => candidate.id === folderId);
      if (!folder) return;
      for (const entry of entries.filter((candidate) => candidate.folderId === folderId)) {
        await saveEntry({ ...entry, folderId: null, updatedAt: new Date().toISOString() });
      }
      setProtectedFolders((current) => current.filter((candidate) => candidate.id !== folderId));
      deleteRecord(folderId, folder.syncVersion);
    },
    [deleteRecord, entries, protectedFolders, saveEntry],
  );

  const toggleFavorite = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      return entry ? updateEntry(entryId, { favorite: !entry.favorite }) : Promise.resolve();
    },
    [entries, updateEntry],
  );
  const toggleReviewed = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      return entry ? updateEntry(entryId, { reviewed: !entry.reviewed }) : Promise.resolve();
    },
    [entries, updateEntry],
  );
  const toggleTodoItem = useCallback(
    (entryId: string, todoItemId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      const toggled = entry ? toggleEntryTodo(entry, todoItemId) : null;
      return entry && toggled ? updateEntry(entryId, toggled) : Promise.resolve();
    },
    [entries, updateEntry],
  );

  // Finds deleted entries too, so Recently Deleted can show them.
  const getEntry = useCallback(
    (entryId: string | undefined) => entries.find((entry) => entry.id === entryId),
    [entries],
  );
  const visibleEntries = useMemo(() => liveEntries(entries), [entries]);
  const recentlyDeleted = useMemo(() => deletedEntriesOf(entries), [entries]);
  const deletedRecordCount = useMemo(
    () =>
      status === 'unlocked' ? recentlyDeleted.length : journal.records.filter((record) => record.deletedAt).length,
    [journal.records, recentlyDeleted.length, status],
  );
  const dismissSyncIssue = useCallback(
    (issueId: string) =>
      setJournal((current) => ({
        ...current,
        syncIssues: (current.syncIssues ?? []).filter((issue) => issue.id !== issueId),
      })),
    [],
  );
  const retrySync = useCallback(() => {
    pulledUserRef.current = null;
    attemptedPendingRef.current = null;
    setPrivateSyncStatus(isOnline ? 'syncing' : 'offline');
    setRetryNonce((value) => value + 1);
  }, [isOnline]);
  const value = useMemo<PrivateJournalContextValue>(
    () => ({
      biometricAvailable,
      changePin,
      configuration,
      createEntry,
      createProtectedFolder,
      deleteEntry,
      deleteEntriesForever,
      deletedEntries: recentlyDeleted,
      deletedRecordCount,
      deleteProtectedFolder,
      dismissSyncIssue,
      entries: visibleEntries,
      getEntry,
      lock,
      protectedFolders,
      pendingChangeCount: journal.pending.length,
      recover,
      resetPinWithBiometrics,
      restoreEntry,
      retrySync,
      setBiometricEnabled,
      setup,
      status,
      syncIssues: journal.syncIssues ?? [],
      syncStatus: !isOnline ? 'offline' : privateSyncStatus,
      toggleFavorite,
      toggleReviewed,
      toggleTodoItem,
      unlockWithBiometrics,
      unlockWithPin,
      updateEntry,
    }),
    [
      biometricAvailable,
      changePin,
      configuration,
      createEntry,
      createProtectedFolder,
      deleteEntry,
      deleteEntriesForever,
      deletedRecordCount,
      deleteProtectedFolder,
      dismissSyncIssue,
      getEntry,
      recentlyDeleted,
      restoreEntry,
      visibleEntries,
      isOnline,
      journal.pending.length,
      journal.syncIssues,
      lock,
      protectedFolders,
      privateSyncStatus,
      recover,
      resetPinWithBiometrics,
      retrySync,
      setBiometricEnabled,
      setup,
      status,
      toggleFavorite,
      toggleReviewed,
      toggleTodoItem,
      unlockWithBiometrics,
      unlockWithPin,
      updateEntry,
    ],
  );

  return <PrivateJournalContext.Provider value={value}>{children}</PrivateJournalContext.Provider>;
}

export function usePrivateJournal() {
  const context = useContext(PrivateJournalContext);
  if (!context) throw new Error('usePrivateJournal must be used inside PrivateJournalProvider.');
  return context;
}
