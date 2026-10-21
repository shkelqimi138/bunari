import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createApp } from '../app.mjs';
import { createAppleTokenRevoker } from '../apple-revoke.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
const nowMs = Date.parse('2026-10-07T12:00:00Z');
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (sub) => `${part({ alg: 'RS256' })}.${part({ sub })}.signature`;

// A fake appleid.apple.com that records what is posted to it.
function fakeApple({ sub = 'apple-1', tokenStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const fields = Object.fromEntries(new URLSearchParams(options.body));
    calls.push({ fields, path: new URL(url).pathname });
    if (url.endsWith('/auth/token')) {
      return new Response(JSON.stringify({ access_token: 'a1', id_token: idToken(sub), refresh_token: 'r1' }), {
        status: tokenStatus,
      });
    }
    return new Response('', { status: 200 });
  };
  return { calls, fetchImpl };
}

function revoker(fetchImpl) {
  return createAppleTokenRevoker({
    clientId: 'journal.w.sh',
    fetchImpl,
    keyId: 'KEY123',
    now: () => nowMs,
    privateKey: pem,
    teamId: 'TEAM123',
  });
}

test('without the Apple key nothing is revoked, and a broken key is reported without printing it', () => {
  assert.equal(
    createAppleTokenRevoker({ clientId: 'journal.w.sh', keyId: null, privateKey: null, teamId: 'TEAM123' }),
    null,
  );
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(
      createAppleTokenRevoker({
        clientId: 'journal.w.sh',
        keyId: 'KEY123',
        privateKey: 'not-a-key-SECRET',
        teamId: 'TEAM123',
      }),
      null,
    );
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes('SECRET'));
});

test('the code is exchanged with a signed client secret, then the refresh token is revoked', async () => {
  const apple = fakeApple();
  assert.equal(await revoker(apple.fetchImpl).revoke({ appleSubject: 'apple-1', authorizationCode: 'code-1' }), true);
  assert.deepEqual(
    apple.calls.map((call) => call.path),
    ['/auth/token', '/auth/revoke'],
  );

  const [exchange, revoke] = apple.calls;
  assert.equal(exchange.fields.code, 'code-1');
  assert.equal(exchange.fields.grant_type, 'authorization_code');
  assert.equal(exchange.fields.client_id, 'journal.w.sh');
  assert.deepEqual(
    { token: revoke.fields.token, type: revoke.fields.token_type_hint },
    { token: 'r1', type: 'refresh_token' },
  );

  // The client secret is an ES256 token Apple can check with the key's public half.
  const [header, payload, signature] = exchange.fields.client_secret.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    aud: 'https://appleid.apple.com',
    exp: nowMs / 1000 + 300,
    iat: nowMs / 1000,
    iss: 'TEAM123',
    sub: 'journal.w.sh',
  });
  const valid = createVerify('SHA256')
    .update(`${header}.${payload}`)
    .verify({ dsaEncoding: 'ieee-p1363', key: publicKey }, Buffer.from(signature, 'base64url'));
  assert.ok(valid);
});

test("another Apple ID's code, or a failed exchange, revokes nothing", async () => {
  const otherUser = fakeApple({ sub: 'apple-2' });
  assert.equal(
    await revoker(otherUser.fetchImpl).revoke({ appleSubject: 'apple-1', authorizationCode: 'code-1' }),
    false,
  );
  assert.deepEqual(
    otherUser.calls.map((call) => call.path),
    ['/auth/token'],
  );

  const failed = fakeApple({ tokenStatus: 400 });
  assert.equal(await revoker(failed.fetchImpl).revoke({ appleSubject: 'apple-1', authorizationCode: 'code-1' }), false);

  const offline = revoker(async () => {
    throw new Error('offline');
  });
  assert.equal(await offline.revoke({ appleSubject: 'apple-1', authorizationCode: 'code-1' }), false);
});

let baseUrl;
let server;
const events = [];
const freshToken = `header.${part({ amr: [{ method: 'oauth', timestamp: nowMs / 1000 - 30 }], iat: nowMs / 1000 - 30 })}.signature`;

before(async () => {
  server = createApp({
    accountAdmin: {
      deleteAccount: async (userId) => {
        events.push(`delete ${userId}`);
      },
    },
    appleRevoker: {
      revoke: async ({ appleSubject, authorizationCode }) => {
        events.push(`revoke ${appleSubject} ${authorizationCode}`);
        if (authorizationCode === 'fails') throw new Error('Apple is down');
        return true;
      },
    },
    authenticate: async (authorization) =>
      authorization === `Bearer ${freshToken}`
        ? { appleSubject: 'apple-1', email: 'journal@example.com', id: 'user-1' }
        : null,
    now: () => nowMs,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

function deleteAccount(body) {
  return fetch(`${baseUrl}/v1/account`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${freshToken}`, 'content-type': 'application/json' },
    method: 'DELETE',
  });
}

// Revoking runs just after the reply.
async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

test('deleting a profile confirmed with Apple deletes it, replies, then revokes that Apple ID', async () => {
  events.length = 0;
  const response = await deleteAccount({ appleAuthorizationCode: 'code-1' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  await settled();
  assert.deepEqual(events, ['delete user-1', 'revoke apple-1 code-1']);
});

test('the profile is deleted even when revoking fails, the code is malformed, or there is no code', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    for (const body of [
      { appleAuthorizationCode: 'fails' },
      { appleAuthorizationCode: 'not a code' },
      undefined,
      null,
    ]) {
      events.length = 0;
      const response = await deleteAccount(body);
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual(await response.json(), { deleted: true });
      await settled();
      assert.equal(events[0], 'delete user-1');
      assert.ok(!events.some((event) => event.includes('not a code')));
    }
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(
    warnings,
    ['Sign in with Apple tokens could not be revoked after a profile deletion.'],
    'one warning, for the failed revoke, naming no account',
  );
});

test("the session check reads the account's linked Apple ID, if any", async () => {
  const { createSupabaseAuthenticator } = await import('../auth.mjs');
  const realFetch = globalThis.fetch;
  const users = {
    'Bearer apple': {
      email: 'a@example.com',
      id: 'user-a',
      identities: [
        { id: 'email-a', provider: 'email' },
        { identity_data: { sub: 'apple-9' }, provider: 'apple' },
      ],
    },
    'Bearer email': { email: 'b@example.com', id: 'user-b', identities: [{ id: 'email-b', provider: 'email' }] },
  };
  globalThis.fetch = async (url, options) =>
    new Response(JSON.stringify(users[options.headers.authorization]), { status: 200 });
  try {
    const authenticate = createSupabaseAuthenticator({
      supabasePublishableKey: 'publishable',
      supabaseUrl: 'https://project.supabase.co',
    });
    assert.deepEqual(await authenticate('Bearer apple'), {
      appleSubject: 'apple-9',
      email: 'a@example.com',
      id: 'user-a',
    });
    assert.deepEqual(await authenticate('Bearer email'), { appleSubject: null, email: 'b@example.com', id: 'user-b' });
  } finally {
    globalThis.fetch = realFetch;
  }
});
