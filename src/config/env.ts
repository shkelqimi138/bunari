// Validated public app configuration from EXPO_PUBLIC_ environment variables
type PublicEnvironment = Readonly<{
  apiBaseUrl: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
}>;

export const env: PublicEnvironment = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
};

export function requireSupabaseEnvironment() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  let url: URL;

  try {
    url = new URL(env.supabaseUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS.');
  }

  return {
    publishableKey: env.supabasePublishableKey,
    url: url.toString().replace(/\/$/, ''),
  } as const;
}

export function requireApiEnvironment() {
  if (!env.apiBaseUrl) throw new Error('Missing EXPO_PUBLIC_API_BASE_URL.');

  let url: URL;
  try {
    url = new URL(env.apiBaseUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use HTTPS.');
  }

  return url.toString().replace(/\/$/, '');
}
