# Railway API

## Current deployment status

- Railway is deployed and running.
- `SUPABASE_SERVICE_ROLE_KEY` is configured as a server-only Railway variable for authenticated profile deletion.
- Never copy Railway secrets into the iOS app, `app.json`, source control, or an `EXPO_PUBLIC_` variable.

## Railway variables

- `SUPABASE_URL`: the same Supabase project URL used by the app.
- `SUPABASE_PUBLISHABLE_KEY`: the same publishable key used by the app.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service-role key required for authenticated profile deletion. Never expose this value to the app.
- `OPENAI_API_KEY`: server-only OpenAI API key.
- `OPENAI_MODEL`: optional; defaults to `gpt-5.4-mini`.
- `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`: optional, server-only. A Sign in with Apple key (Apple Developer › Certificates, IDs & Profiles › Keys, with Sign in with Apple enabled for `journal.w.sh`): its Key ID, and the whole text of its `.p8` file. With them, Delete Profile confirmed with Sign in with Apple also revokes Bunari's Apple tokens (Apple TN3194), just after the profile is deleted; without them, or if revoking fails, the profile is still deleted. `APPLE_TEAM_ID` (default `945267LMP6`) and `APPLE_CLIENT_ID` (default `journal.w.sh`) only need setting if those ever change.
- `ALLOWED_ORIGINS`: optional comma-separated web origins. Native iOS requests do not require CORS.
- `PORT`: supplied automatically by Railway; do not set it manually.

Do not place a Supabase service-role key, an AI provider key, or the Apple key in any `EXPO_PUBLIC_` variable.

## Deployment

Deploy the repository root. Railway reads `railway.json`, builds the server-only `Dockerfile`, starts the API, and checks `/health`. The `Dockerfile` pins an exact Node 22 image (`node:22.23.3-alpine`), the version the tests run on; change it only on purpose.

After Railway creates a public domain, set the app's `EXPO_PUBLIC_API_BASE_URL` to that HTTPS URL and restart Expo.

## Endpoints

- `GET /health`: public deployment health check.
- `GET /v1/session`: validates the caller's Supabase bearer token.
- `DELETE /v1/account`: permanently deletes the authenticated user's stored media, database rows, and Supabase Auth account. Requires a real sign-in in the last 10 minutes, read from the token's `amr` sign-in records (the app signs in again with the account password, or with Apple for Apple accounts); a refreshed session adds no sign-in record, so it gets `401 reauthentication_required`.
- `GET /v1/ai/daily-prompt`: returns the user's cached or generated daily prompt.
- `POST /v1/ai/mood-suggestion`: suggests a mood for one synced non-Private entry.
- `GET /v1/ai/weekly-summary`: returns a cached or generated non-Private weekly insight.

AI limits: daily prompts only for dates within one day of today (UTC), weekly summaries only for the last 62 days, and at most 30 new (uncached) AI results per account per UTC day (`429 ai_limit_reached`). A weekly summary sends at most 50 entries to OpenAI, each cut to 2,000 characters, and at most 40,000 characters in total. The counter is kept in Supabase (`supabase/migrations/20260928204804_ai_usage_limit.sql`, function `take_ai_quota`) so restarts do not reset it; until that migration is applied, or if Supabase cannot be reached, an in-memory counter is used instead.

Rate limit: every `/v1/` request is limited to 120 per minute per caller address (`429 rate_limited`, `retry-after: 60`); `/health` is not limited. The address is `X-Real-IP`, which Railway's edge sets to the caller's address; `X-Forwarded-For` is ignored (the last `X-Forwarded-For` value, used until 2026-10-08, did not identify the caller on Railway, so the limit never applied). At most 50,000 addresses are counted per minute; beyond that, new addresses pass uncounted until the minute ends, so the table cannot fill the server's memory (security audit, 2026-10-08).
