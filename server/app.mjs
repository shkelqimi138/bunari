// HTTP API routes (health, session, AI features, account deletion with Apple token revoking) with CORS and JSON errors
import { createServer } from 'node:http';

import { AiUnavailableError, completePrompt, completeWeeklySummary } from './openai.mjs';

class RequestError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function send(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    // Railway serves the API over HTTPS only; browsers must never downgrade to HTTP.
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'DELETE, GET, POST, OPTIONS',
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_384) throw new RequestError('Request body is too large.', 413, 'body_too_large');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new RequestError('Request body must be valid JSON.');
  }
}

function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  );
}

function validTimezone(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Seconds since the user last actually signed in (password, Sign in with Apple, or an email link),
// read from the `amr` sign-in records of the already verified JWT. Refreshing a session issues a
// new token but adds no sign-in record, so a stolen refresh token cannot make a session look fresh.
function lastSignInAgeSeconds(authorization, nowMs) {
  const payload = authorization?.slice(7).split('.')[1];
  if (!payload) return Infinity;
  try {
    const { amr } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const times = Array.isArray(amr)
      ? amr.map((entry) => entry?.timestamp).filter((time) => typeof time === 'number')
      : [];
    return times.length > 0 ? nowMs / 1000 - Math.max(...times) : Infinity;
  } catch {
    return Infinity;
  }
}

// Counts new (uncached) AI results per user per UTC day, so one account cannot run up unbounded
// OpenAI costs. The count is kept in the database so restarts do not reset it; the in-memory
// count is used only if the database count is unavailable (for example before its migration).
function createAiQuota(limit, aiStore) {
  let day = '';
  const counts = new Map();
  function takeInMemory(userId, today) {
    if (today !== day) {
      day = today;
      counts.clear();
    }
    const used = counts.get(userId) ?? 0;
    if (used >= limit) return false;
    counts.set(userId, used + 1);
    return true;
  }
  return {
    async take({ authorization, today, userId }) {
      let allowed = null;
      try {
        allowed = (await aiStore?.takeAiQuota?.({ authorization, limit })) ?? null;
      } catch {
        allowed = null;
      }
      if (allowed === null) allowed = takeInMemory(userId, today);
      if (!allowed) throw new RequestError('Daily AI limit reached. Try again tomorrow.', 429, 'ai_limit_reached');
    },
  };
}

// The caller's address. Railway's edge puts it in X-Real-IP (docs: Public Networking › Specs & Limits).
// The last X-Forwarded-For value, used before, did not identify the caller on Railway: in production
// 400 requests in 6 seconds were never limited (2026-10-08). X-Forwarded-For is ignored, since callers
// can write anything into it. Without X-Real-IP (local runs), the connection's own address counts.
function clientAddress(request) {
  const realIp = String(request.headers['x-real-ip'] ?? '').trim();
  return realIp || request.socket?.remoteAddress || 'unknown';
}

// Limits API requests per address per minute, so floods of requests (with or without a valid
// token) cannot keep the server and Supabase's token checks busy. At most `maxAddresses` are counted
// per minute; further new addresses pass uncounted until the minute ends, so a flood from ever-new
// addresses (cheap with IPv6) cannot grow the table until the server runs out of memory. A flood
// from that many addresses is beyond what a per-address limit can stop anyway.
function createRateLimiter(limit, windowMs, now, maxAddresses) {
  let windowStart = 0;
  const counts = new Map();
  return {
    allow(address) {
      const current = now();
      if (current - windowStart >= windowMs) {
        windowStart = current;
        counts.clear();
      }
      if (!counts.has(address) && counts.size >= maxAddresses) return true;
      const used = (counts.get(address) ?? 0) + 1;
      counts.set(address, used);
      return used <= limit;
    },
  };
}

// The weekly summary sends at most 50 entries, each cut to 2,000 characters of text, and stops
// adding entries once 40,000 characters are used, so large entries cannot run up OpenAI costs.
const weeklySummaryMaxEntries = 50;
const weeklySummaryEntryChars = 2000;
const weeklySummaryTotalChars = 40_000;

function weeklySummaryInput(entries) {
  const input = [];
  let used = 0;
  for (const entry of entries.slice(0, weeklySummaryMaxEntries)) {
    const title = String(entry.title ?? '').slice(0, 300);
    const plainText = String(entry.plain_text ?? '').slice(0, weeklySummaryEntryChars);
    const size = title.length + plainText.length;
    if (input.length > 0 && used + size > weeklySummaryTotalChars) break;
    input.push({ entry_date: entry.entry_date, mood: entry.mood ?? null, plain_text: plainText, title });
    used += size;
  }
  return input;
}

const recentSignInSeconds = 10 * 60;
const weeklySummaryHistoryDays = 62;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createApp({
  accountAdmin,
  ai,
  aiDailyLimit = 30,
  aiStore,
  allowedOrigins = new Set(),
  appleRevoker = null,
  authenticate,
  now = () => Date.now(),
  rateLimitAddresses = 50_000,
  requestsPerMinute = 120,
}) {
  const aiQuota = createAiQuota(aiDailyLimit, aiStore);
  const rateLimiter = createRateLimiter(requestsPerMinute, 60_000, now, rateLimitAddresses);

  return createServer(async (request, response) => {
    const today = new Date(now()).toISOString().slice(0, 10);
    const cors = corsHeaders(request, allowedOrigins);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { service: 'bunari-api', status: 'ok' }, cors);
      return;
    }

    if (!rateLimiter.allow(clientAddress(request))) {
      send(
        response,
        429,
        { error: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' } },
        { ...cors, 'retry-after': '60' },
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/session') {
      try {
        const user = await authenticate(request.headers.authorization);
        if (!user) {
          send(response, 401, { error: { code: 'unauthorized', message: 'A valid session is required.' } }, cors);
          return;
        }
        send(response, 200, { user: { email: user.email, id: user.id } }, cors);
      } catch {
        send(
          response,
          503,
          { error: { code: 'authentication_unavailable', message: 'Authentication is temporarily unavailable.' } },
          cors,
        );
      }
      return;
    }

    if (request.method === 'DELETE' && url.pathname === '/v1/account') {
      try {
        const user = await authenticate(request.headers.authorization);
        if (!user) throw new RequestError('A valid session is required.', 401, 'unauthorized');
        // Deleting everything needs a sign-in in the last 10 minutes, not just any valid session.
        if (lastSignInAgeSeconds(request.headers.authorization, now()) > recentSignInSeconds) {
          throw new RequestError(
            'Confirm it is you again before deleting your profile.',
            401,
            'reauthentication_required',
          );
        }
        if (!accountAdmin)
          throw new RequestError('Account deletion is temporarily unavailable.', 503, 'account_deletion_unavailable');
        // Older builds send no body; a confirmation with Apple sends its one-time authorization code.
        const code = (await readJson(request))?.appleAuthorizationCode;
        const appleCode = typeof code === 'string' && /^[\w.-]{1,2048}$/.test(code) ? code : null;
        await accountAdmin.deleteAccount(user.id);
        send(response, 200, { deleted: true }, cors);
        // After the reply, so Apple can never delay or fail a deletion; if revoking fails, the profile
        // stays deleted (Apple TN3194). The warning names no account.
        if (appleCode && appleRevoker) {
          void appleRevoker
            .revoke({ appleSubject: user.appleSubject ?? null, authorizationCode: appleCode })
            .catch(() => false)
            .then((revoked) => {
              if (!revoked) console.warn('Sign in with Apple tokens could not be revoked after a profile deletion.');
            });
        }
      } catch (error) {
        if (error instanceof RequestError) {
          send(response, error.status, { error: { code: error.code, message: error.message } }, cors);
          return;
        }
        send(
          response,
          503,
          {
            error: {
              code: 'account_deletion_failed',
              message: 'Account deletion could not be completed. Your on-device data was kept.',
            },
          },
          cors,
        );
      }
      return;
    }

    if (url.pathname.startsWith('/v1/ai/')) {
      try {
        const user = await authenticate(request.headers.authorization);
        if (!user) throw new RequestError('A valid session is required.', 401, 'unauthorized');
        if (!ai || !aiStore) throw new AiUnavailableError('AI is not configured.');
        const authorization = request.headers.authorization;

        if (request.method === 'GET' && url.pathname === '/v1/ai/daily-prompt') {
          const localDate = url.searchParams.get('date');
          const timezone = url.searchParams.get('timezone');
          if (!validDate(localDate) || !validTimezone(timezone))
            throw new RequestError('A valid local date and timezone are required.');
          // Every timezone's "today" is within one day of UTC.
          if (localDate < shiftDate(today, -1) || localDate > shiftDate(today, 1))
            throw new RequestError('Daily prompts are available only for today.');
          const cached = await aiStore.getDailyPrompt({ authorization, localDate, userId: user.id });
          // A prompt saved before the finished-sentence check (cut off mid-sentence) is made again.
          if (cached && completePrompt(cached.prompt_text)) {
            send(
              response,
              200,
              {
                cached: true,
                date: localDate,
                minutes: cached.estimated_minutes,
                model: cached.model,
                prompt: cached.prompt_text,
                provider: cached.provider,
              },
              cors,
            );
            return;
          }
          await aiQuota.take({ authorization, today, userId: user.id });
          const generated = await ai.dailyPrompt({ localDate });
          await aiStore.saveDailyPrompt({
            authorization,
            localDate,
            minutes: generated.minutes,
            model: ai.model,
            prompt: generated.prompt,
            provider: ai.provider,
            timezone,
            userId: user.id,
          });
          send(
            response,
            200,
            { cached: false, date: localDate, model: ai.model, provider: ai.provider, ...generated },
            cors,
          );
          return;
        }

        if (request.method === 'POST' && url.pathname === '/v1/ai/mood-suggestion') {
          const body = await readJson(request);
          if (!uuidPattern.test(body.entryId ?? '')) throw new RequestError('A valid entry ID is required.');
          const entry = await aiStore.getEntry({ authorization, entryId: body.entryId, userId: user.id });
          if (!entry)
            throw new RequestError(
              'The non-Private entry was not found or has not synced yet.',
              404,
              'entry_not_found',
            );
          await aiQuota.take({ authorization, today, userId: user.id });
          const suggestion = await ai.moodSuggestion({
            description: entry.description,
            plainText: String(entry.plain_text ?? '').slice(0, 12_000),
            title: String(entry.title ?? '').slice(0, 300),
          });
          send(response, 200, suggestion, cors);
          return;
        }

        if (request.method === 'GET' && url.pathname === '/v1/ai/weekly-summary') {
          const periodStart = url.searchParams.get('start');
          const periodEnd = url.searchParams.get('end');
          if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
            throw new RequestError('A valid weekly date range is required.');
          }
          const span = (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000;
          if (span > 7) throw new RequestError('Weekly summaries are limited to eight days.');
          if (periodEnd > shiftDate(today, 1) || periodStart < shiftDate(today, -weeklySummaryHistoryDays)) {
            throw new RequestError('Weekly summaries are available only for recent weeks.');
          }
          const cached = await aiStore.getWeeklySummary({ authorization, periodEnd, periodStart, userId: user.id });
          const cachedSummary = cached ? completeWeeklySummary(cached.summary) : null;
          if (cached && cachedSummary) {
            send(
              response,
              200,
              { cached: true, model: cached.model, provider: cached.provider, summary: cachedSummary },
              cors,
            );
            return;
          }
          const entries = await aiStore.listWeeklyEntries({
            authorization,
            endExclusive: shiftDate(periodEnd, 1),
            periodStart,
            userId: user.id,
          });
          if (entries.length === 0)
            throw new RequestError('Write at least one non-Private entry in this period first.', 422, 'no_entries');
          await aiQuota.take({ authorization, today, userId: user.id });
          const summary = await ai.weeklySummary({ entries: weeklySummaryInput(entries), periodEnd, periodStart });
          await aiStore.saveWeeklySummary({
            authorization,
            model: ai.model,
            periodEnd,
            periodStart,
            provider: ai.provider,
            summary,
            userId: user.id,
          });
          send(response, 200, { cached: false, model: ai.model, provider: ai.provider, summary }, cors);
          return;
        }
      } catch (error) {
        if (error instanceof RequestError) {
          send(response, error.status, { error: { code: error.code, message: error.message } }, cors);
          return;
        }
        if (error instanceof AiUnavailableError) {
          send(response, 503, { error: { code: 'ai_unavailable', message: 'AI is temporarily unavailable.' } }, cors);
          return;
        }
        send(response, 503, { error: { code: 'ai_unavailable', message: 'AI is temporarily unavailable.' } }, cors);
        return;
      }
    }

    send(response, 404, { error: { code: 'not_found', message: 'Route not found.' } }, cors);
  });
}
