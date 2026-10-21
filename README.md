# Bunari

A private journaling app for iOS with end-to-end encrypted journals and offline-first sync.

**Live site:** [bunari.app](https://bunari.app)

## Overview

Bunari saves every entry on the device first and syncs it in the background, so it works the same online and offline. Private journals are encrypted on the device before they are synced. Optional AI features suggest a mood and write a weekly insight, and never receive Private content.

## Features

- Rich-text entries with photos, location, folders, and checklist To-Dos
- Private journals encrypted with AES-256, unlocked by PIN or Face ID
- Offline-first sync with retries and conflict copies
- Trips, daily prompts, templates, On This Day, and streaks
- Opt-in AI mood suggestions and weekly insights
- Reminders, PDF export, and Recently Deleted

## Tech stack

- **App:** React Native, Expo, Expo Router, TypeScript
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Storage)
- **API:** Node.js on Railway, OpenAI API
- **Native:** Swift module for encryption key derivation

## Getting started

Requires macOS with Xcode, Node.js 22, and CocoaPods.

```bash
npm ci
npx pod-install
cp .env.example .env   # fill in your values
npm run ios
```

Database migrations are in `supabase/migrations/`; see [`supabase/README.md`](supabase/README.md). The API setup is in [`server/README.md`](server/README.md).

## Scripts

| Script | Description |
| --- | --- |
| `npm run ios` | Build and run the iOS app |
| `npm run check` | Lint, type-check, and check formatting |
| `npm run app:test` | Run app tests |
| `npm run server:test` | Run API tests |
| `npm run server:start` | Start the API locally |

## Development approach

Built with an AI-assisted workflow (Claude Code, Codex), with every change reviewed and integrated by me.

## License

All rights reserved. See [LICENSE](LICENSE).

## Author

**Shkelqim Surkishi** · [GitHub](https://github.com/shkelqimi138) · [Portfolio](https://www.shkelqim.me) · [LinkedIn](https://www.linkedin.com/in/shkelqimsurkishi)
