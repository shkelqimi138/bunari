import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from '../config.mjs';

test('loads valid configuration', () => {
  const config = loadConfig({
    ALLOWED_ORIGINS: 'https://one.example, https://two.example',
    PORT: '8080',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_URL: 'https://project.supabase.co/',
  });
  assert.equal(config.port, 8080);
  assert.equal(config.supabaseUrl, 'https://project.supabase.co');
  assert.equal(config.allowedOrigins.has('https://two.example'), true);
  assert.equal(config.openAiModel, 'gpt-5.4-mini');
  assert.equal(config.supabaseServiceRoleKey, null);
});

test('loads an optional server-only service-role key', () => {
  const config = loadConfig({
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_URL: 'https://project.supabase.co',
  });
  assert.equal(config.supabaseServiceRoleKey, 'service-role-key');
});

test('rejects missing credentials and insecure URLs', () => {
  assert.throws(() => loadConfig({}), /SUPABASE_PUBLISHABLE_KEY/);
  assert.throws(
    () =>
      loadConfig({
        SUPABASE_PUBLISHABLE_KEY: 'key',
        SUPABASE_URL: 'http://project.supabase.co',
      }),
    /HTTPS/,
  );
});
