import { register } from 'node:module';

// Lets node:test import app modules that use the `@/` alias and native-only
// dependencies by redirecting them to in-memory test doubles.
register('./alias-loader.mjs', import.meta.url);
