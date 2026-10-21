// Restores a saved Supabase session at app start
export async function loadSavedSession<T>(
  readSession: () => Promise<T | null>,
  reportError: (error: unknown) => void,
): Promise<T | null> {
  try {
    return await readSession();
  } catch (error) {
    reportError(error);
    return null;
  }
}
