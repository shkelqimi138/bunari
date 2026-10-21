import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { websiteLinks } from '../src/config/website.ts';
import { onRequest } from '../website/functions/_middleware.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

async function visit(url) {
  let served = false;
  const response = await onRequest({
    next: async () => {
      served = true;
      return new Response('site');
    },
    request: new Request(url),
  });
  return { served, status: response.status, text: await response.text() };
}

test('the website shows only at bunari.app and www.bunari.app (user, 2026-10-07)', async () => {
  for (const url of ['https://bunari.app/', 'https://www.bunari.app/#privacy', 'http://localhost:8080/']) {
    assert.deepEqual(await visit(url), { served: true, status: 200, text: 'site' }, url);
  }
});

test('pages.dev addresses answer "Not found", with no page and no redirect', async () => {
  for (const url of [
    'https://bunari-btp.pages.dev/',
    'https://BUNARI-BTP.pages.dev/#terms',
    'https://claude-legal-fixes.bunari-btp.pages.dev/',
    'https://bunari-btp.pages.dev/privacy',
  ]) {
    const visited = await visit(url);
    assert.deepEqual(visited, { served: false, status: 404, text: 'Not found' }, url);
  }
});

test('nothing links to pages.dev any more, and the app opens bunari.app', () => {
  assert.equal(websiteLinks.home, 'https://bunari.app');
  for (const link of Object.values(websiteLinks)) assert.match(link, /^https:\/\/bunari\.app(\/|$)/);
  const site = read('website/index.html');
  assert.match(site, /<link rel="canonical" href="https:\/\/bunari\.app\/">/);
  for (const file of readdirSync(new URL('../website/', import.meta.url)).filter((name) =>
    /\.(html|js|css|txt|json)$|^_/.test(name),
  )) {
    if (file === 'functions') continue;
    assert.ok(!read(`website/${file}`).includes('pages.dev'), file);
  }
  assert.ok(!read('src/config/website.ts').includes("'https://bunari-btp.pages.dev'"));
});

test('only page requests run the function; images, fonts, the stylesheet, the script and favicon.ico are plain files', () => {
  assert.deepEqual(JSON.parse(read('website/_routes.json')), {
    exclude: ['/images/*', '/fonts/*', '/styles.css', '/modal.js', '/favicon.ico'],
    include: ['/*'],
    version: 1,
  });
});
