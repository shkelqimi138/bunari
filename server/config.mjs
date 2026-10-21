// Loads and validates the API server's environment configuration
function required(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function httpsUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(environment = process.env) {
  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    // Sign in with Apple key, for revoking Apple tokens on profile deletion; optional. The team and
    // client ID default to Bunari's (journal.w.sh); only the key ID and the .p8 key need setting.
    appleClientId: environment.APPLE_CLIENT_ID?.trim() || 'journal.w.sh',
    appleKeyId: environment.APPLE_KEY_ID?.trim() || null,
    applePrivateKey: environment.APPLE_PRIVATE_KEY?.trim() || null,
    appleTeamId: environment.APPLE_TEAM_ID?.trim() || '945267LMP6',
    allowedOrigins: new Set(
      (environment.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    openAiApiKey: environment.OPENAI_API_KEY?.trim() || null,
    openAiModel: environment.OPENAI_MODEL?.trim() || 'gpt-5.4-mini',
    port,
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', environment),
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    supabaseUrl: httpsUrl('SUPABASE_URL', required('SUPABASE_URL', environment)),
  };
}
