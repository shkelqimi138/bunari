// Offline queue and Supabase sync for favorite prompts
import { syncErrorMessage } from '@/data/sync-error';
import { storageLimitMessage } from '@/domain/storage-limits';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'expo-crypto';

export type PromptFavoriteMutation = {
  mutationId: string;
  promptId: string;
  saved: boolean;
};

export type PersistedPromptFavorites = {
  pending: PromptFavoriteMutation[];
  savedPromptIds: string[];
  version: 1;
};

export function promptStorageKey(userId: string) {
  return `prompt-favorites.v1.${userId}`;
}

export function mergePromptMutation(current: PromptFavoriteMutation[], next: PromptFavoriteMutation) {
  return [...current.filter((mutation) => mutation.promptId !== next.promptId), next];
}

export function normalizePromptMutations(mutations: PromptFavoriteMutation[]) {
  return mutations.map((mutation) => (mutation.mutationId ? mutation : { ...mutation, mutationId: randomUUID() }));
}

export function reconcilePromptSync(
  current: PersistedPromptFavorites,
  snapshot: PersistedPromptFavorites,
  result: PersistedPromptFavorites,
) {
  const snapshotIds = new Set(snapshot.pending.map((mutation) => mutation.mutationId));
  const newer = current.pending.filter((mutation) => !snapshotIds.has(mutation.mutationId));
  const savedPromptIds = [...result.savedPromptIds];
  let pending = [...result.pending];

  for (const mutation of newer) {
    pending = mergePromptMutation(pending, mutation);
    const index = savedPromptIds.indexOf(mutation.promptId);
    if (mutation.saved && index < 0) savedPromptIds.push(mutation.promptId);
    if (!mutation.saved && index >= 0) savedPromptIds.splice(index, 1);
  }

  return { pending, savedPromptIds, version: 1 } satisfies PersistedPromptFavorites;
}

export async function synchronizePromptFavorites(userId: string, local: PersistedPromptFavorites) {
  const remaining: PromptFavoriteMutation[] = [];
  let syncError: string | null = null;

  for (let index = 0; index < local.pending.length; index += 1) {
    const mutation = local.pending[index]!;
    const result = mutation.saved
      ? await supabase
          .from('prompt_favorites')
          .upsert({ prompt_id: mutation.promptId, user_id: userId }, { onConflict: 'user_id,prompt_id' })
      : await supabase.from('prompt_favorites').delete().eq('user_id', userId).eq('prompt_id', mutation.promptId);

    if (result.error) {
      remaining.push(mutation);
      syncError = storageLimitMessage(result.error) ?? syncErrorMessage(result.error);
    }
  }

  const { data, error } = await supabase.from('prompt_favorites').select('prompt_id').eq('user_id', userId);
  if (error) throw error;

  const remoteIds = data.map((row) => row.prompt_id);
  for (const mutation of remaining) {
    const index = remoteIds.indexOf(mutation.promptId);
    if (mutation.saved && index < 0) remoteIds.push(mutation.promptId);
    if (!mutation.saved && index >= 0) remoteIds.splice(index, 1);
  }

  return { pending: remaining, savedPromptIds: remoteIds, syncError, version: 1 as const };
}
