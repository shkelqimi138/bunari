// The readable part of a failed Supabase request, shown in sync issue messages. Used by the journal,
// Private and saved-prompt sync, so all three describe a failure the same way.
export function syncErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown synchronization error.';
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
  return [message || 'Synchronization request failed.', code ? `Code ${code}` : ''].filter(Boolean).join(' ');
}
