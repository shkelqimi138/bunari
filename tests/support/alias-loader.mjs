// Node module loader that resolves the @/ alias and swaps native modules for test doubles
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = new URL('../../src/', import.meta.url);

const doubles = {
  '@/data/media-cache': new URL('./fake-media-cache.mjs', import.meta.url).href,
  '@/data/local-store': new URL('./fake-local-store.mjs', import.meta.url).href,
  '@/lib/supabase': new URL('./fake-supabase.mjs', import.meta.url).href,
  '@react-native-async-storage/async-storage': new URL('./fake-async-storage.mjs', import.meta.url).href,
  'expo-crypto': new URL('./fake-expo-crypto.mjs', import.meta.url).href,
  'expo-notifications': new URL('./fake-notifications.mjs', import.meta.url).href,
};

function resolveSource(specifier) {
  const base = fileURLToPath(new URL(specifier.slice(2), srcRoot));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (doubles[specifier]) return { shortCircuit: true, url: doubles[specifier] };
  if (specifier.startsWith('@/')) {
    const url = resolveSource(specifier);
    if (url) return { shortCircuit: true, url };
  }
  return nextResolve(specifier, context);
}
