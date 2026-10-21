// Prompt provider: prompt library and synced favorites
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

import {
  mergePromptMutation,
  normalizePromptMutations,
  type PersistedPromptFavorites,
  promptStorageKey,
  reconcilePromptSync,
  synchronizePromptFavorites,
} from '@/data/prompt-sync';
import { readLocalJson, writeLocalJson } from '@/data/local-store';
import { journalPrompts } from '@/domain/prompts';
import { useIsOnline } from '@/hooks/use-is-online';
import { useAuth } from '@/state/auth-context';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

type PromptSyncStatus = 'idle' | 'offline' | 'syncing' | 'error';

type PromptContextValue = {
  isSaved: (promptId: string) => boolean;
  pendingChangeCount: number;
  ready: boolean;
  retrySync: () => void;
  savedPromptIds: string[];
  savedPrompts: typeof journalPrompts;
  syncError: string | null;
  toggleSavedPrompt: (promptId: string) => void;
  syncStatus: PromptSyncStatus;
};

const PromptContext = createContext<PromptContextValue | null>(null);

export function PromptProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [savedPromptIds, setSavedPromptIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PersistedPromptFavorites['pending']>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [syncStatus, setSyncStatus] = useState<PromptSyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const attemptedPendingRef = useRef<string | null>(null);
  const stateRef = useRef<PersistedPromptFavorites>({ pending: [], savedPromptIds: [], version: 1 });
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
        setSavedPromptIds([]);
        setPending([]);
        setLoadedUserId(null);
        setHydrated(true);
      });
      return () => {
        active = false;
      };
    }

    void readLocalJson<PersistedPromptFavorites>(promptStorageKey(userId)).then((saved) => {
      if (!active) return;
      setSavedPromptIds(saved?.version === 1 ? saved.savedPromptIds : []);
      setPending(saved?.version === 1 ? normalizePromptMutations(saved.pending) : []);
      loadedUserRef.current = userId;
      setLoadedUserId(userId);
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    stateRef.current = { pending, savedPromptIds, version: 1 };
  }, [pending, savedPromptIds]);

  useEffect(() => {
    if (!hydrated || !user || loadedUserRef.current !== user.id) return;
    const timer = setTimeout(() => {
      if (loadedUserRef.current !== user.id) return;
      void writeLocalJson(promptStorageKey(user.id), {
        pending,
        savedPromptIds,
        version: 1,
      } satisfies PersistedPromptFavorites);
    }, 150);
    return () => clearTimeout(timer);
  }, [hydrated, pending, savedPromptIds, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!user || loadedUserRef.current !== user.id) return;
      if (nextState === 'active') {
        pulledUserRef.current = null;
        attemptedPendingRef.current = null;
        setRetryNonce((value) => value + 1);
      } else {
        void writeLocalJson(promptStorageKey(user.id), stateRef.current);
      }
    });
    return () => subscription.remove();
  }, [user]);

  useEffect(() => {
    if (!isOnline) {
      attemptedPendingRef.current = null;
      return;
    }
    if (!hydrated || !user || loadedUserRef.current !== user.id || syncingRef.current) return;
    if (pending.length === 0 && pulledUserRef.current === user.id) return;

    const pendingSignature = pending.map((mutation) => mutation.mutationId).join(':');
    if (pending.length > 0 && attemptedPendingRef.current === pendingSignature) return;
    attemptedPendingRef.current = pendingSignature;

    syncingRef.current = true;
    setSyncStatus('syncing');
    const snapshot: PersistedPromptFavorites = { pending, savedPromptIds, version: 1 };
    void synchronizePromptFavorites(user.id, snapshot)
      .then((result) => {
        const reconciled = reconcilePromptSync(stateRef.current, snapshot, result);
        setPending(reconciled.pending);
        setSavedPromptIds(reconciled.savedPromptIds);
        setSyncError(result.syncError);
        pulledUserRef.current = user.id;
        setSyncStatus(reconciled.pending.length > 0 ? 'error' : 'idle');
        if (reconciled.pending.length === 0) attemptedPendingRef.current = null;
        if (reconciled.pending.length > 0) {
          setTimeout(() => {
            attemptedPendingRef.current = null;
            setRetryNonce((value) => value + 1);
          }, 5000);
        }
      })
      .catch((caught) => {
        setSyncError(caught instanceof Error ? caught.message : 'Prompt favorites could not sync.');
        setSyncStatus('error');
        setTimeout(() => {
          attemptedPendingRef.current = null;
          setRetryNonce((value) => value + 1);
        }, 5000);
      })
      .finally(() => {
        syncingRef.current = false;
      });
  }, [hydrated, isOnline, pending, retryNonce, savedPromptIds, user]);

  const toggleSavedPrompt = useCallback((promptId: string) => {
    setSavedPromptIds((current) => {
      const saved = !current.includes(promptId);
      setPending((mutations) => mergePromptMutation(mutations, { mutationId: randomUUID(), promptId, saved }));
      return saved ? [...current, promptId] : current.filter((savedId) => savedId !== promptId);
    });
  }, []);

  const isSaved = useCallback((promptId: string) => savedPromptIds.includes(promptId), [savedPromptIds]);
  const retrySync = useCallback(() => {
    pulledUserRef.current = null;
    attemptedPendingRef.current = null;
    setSyncError(null);
    setSyncStatus(isOnline ? 'syncing' : 'offline');
    setRetryNonce((value) => value + 1);
  }, [isOnline]);
  const savedPrompts = useMemo(
    () => journalPrompts.filter((prompt) => savedPromptIds.includes(prompt.id)),
    [savedPromptIds],
  );
  const ready = hydrated && (!user || loadedUserId === user.id);
  const value = useMemo(
    () => ({
      isSaved,
      pendingChangeCount: pending.length,
      ready,
      retrySync,
      savedPromptIds,
      savedPrompts,
      syncError,
      syncStatus: !isOnline ? ('offline' as const) : syncStatus,
      toggleSavedPrompt,
    }),
    [
      isOnline,
      isSaved,
      pending.length,
      ready,
      retrySync,
      savedPromptIds,
      savedPrompts,
      syncError,
      syncStatus,
      toggleSavedPrompt,
    ],
  );

  return <PromptContext.Provider value={value}>{children}</PromptContext.Provider>;
}

export function usePrompts() {
  const context = useContext(PromptContext);
  if (!context) throw new Error('usePrompts must be used within PromptProvider');
  return context;
}
