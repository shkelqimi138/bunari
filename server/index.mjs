// API server entry point: wires config and services and starts listening
import { createApp } from './app.mjs';
import { createSupabaseAccountAdmin } from './account-admin.mjs';
import { createSupabaseAiStore } from './ai-store.mjs';
import { createAppleTokenRevoker } from './apple-revoke.mjs';
import { createOpenAi } from './openai.mjs';
import { createSupabaseAuthenticator } from './auth.mjs';
import { loadConfig } from './config.mjs';
import { createDeletedEntryPurge, schedulePurge } from './purge-deleted.mjs';

const config = loadConfig();
const accountAdmin = createSupabaseAccountAdmin(config);
const authenticate = createSupabaseAuthenticator(config);
const ai = createOpenAi({ apiKey: config.openAiApiKey, model: config.openAiModel });
const aiStore = createSupabaseAiStore(config);
const appleRevoker = createAppleTokenRevoker({
  clientId: config.appleClientId,
  keyId: config.appleKeyId,
  privateKey: config.applePrivateKey,
  teamId: config.appleTeamId,
});
const server = createApp({
  accountAdmin,
  ai,
  aiStore,
  allowedOrigins: config.allowedOrigins,
  appleRevoker,
  authenticate,
});
// Slow or stalled clients are cut off instead of holding connections open.
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, '0.0.0.0', () => {
  console.log(`API listening on port ${config.port}`);
});

// Entries in Recently Deleted for more than 30 days are deleted for good, even when the app is not
// opened. Needs SUPABASE_SERVICE_ROLE_KEY; without it the app's own cleanup still runs on open.
const purgeSchedule = schedulePurge(createDeletedEntryPurge(config));

function shutdown() {
  purgeSchedule?.stop();
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
