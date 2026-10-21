// Configured Supabase client for the app
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { requireSupabaseEnvironment } from '@/config/env';
import { authStorage } from '@/lib/auth/auth-storage';

const supabaseEnvironment = requireSupabaseEnvironment();

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Supabase request timed out.')), 20000);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
};

export const supabase = createClient(supabaseEnvironment.url, supabaseEnvironment.publishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storage: authStorage,
  },
  global: { fetch: fetchWithTimeout },
});
