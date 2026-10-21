import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { appStoreId, appStoreLinks } from '../src/config/app-store.ts';
import { accountConsentText } from '../src/domain/consent.ts';

const site = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');

test('the website describes the app as it is now (2026-10-07)', () => {
  // To-Dos have had no dates or reminders since build 13; the only reminder is the daily one.
  assert.ok(!/due dates/i.test(site));
  // The last tab is called Account.
  assert.ok(!/Open Settings and tap/.test(site));
  assert.match(site, /Open Account and tap Export readable journal/);
  assert.match(site, /Open Account and tap Delete Profile/);
  // The AI question in the FAQ matches the permission the app asks for.
  assert.match(site, /only after you allow it: Bunari asks first/);
  assert.match(site, /turn it off at any time in Account › AI/);
  // Support emails are in the privacy policy, and Private opens with the PIN or Face ID.
  assert.match(site, /<strong>Support:<\/strong> if you write to us, your email address and your message/);
  assert.match(site, /opens only with your PIN or Face ID/);
  for (const card of ['A daily reminder', 'Share and restore', 'Easy on the eyes'])
    assert.match(site, new RegExp(`<h3>${card}</h3>`));
});

test('creating an account asks for agreement to sensitive content, as the privacy policy says', () => {
  assert.match(accountConsentText, /Terms of use/);
  assert.match(accountConsentText, /Privacy policy/);
  assert.match(accountConsentText, /sensitive things like your health/);
  assert.match(
    site,
    /Sensitive information \(explicit consent\):<\/strong>[^<]*When you create an account, you agree that Bunari stores what you write/,
  );
});

test('the website names the types of providers, not the companies, except OpenAI and Apple (user, 2026-10-08)', () => {
  // Shown text only; the code comments and the Continue page's Supabase address are not what readers see.
  const text = site.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const name of ['Supabase', 'Railway', 'Cloudflare', 'Resend', 'Hostinger', 'Ireland', 'California']) {
    assert.ok(!text.includes(name), name);
  }
  // OpenAI stays named: the app names it when it asks before sending entries (App Review 5.1.2(i)).
  assert.match(text, /<strong>OpenAI:<\/strong> the AI features above/);
  assert.match(text, /<strong>An email delivery service:<\/strong>/);
  assert.match(text, /<strong>An email host:<\/strong>/);
  assert.match(text, /Email us if you want to know their names/);
});

test('pre-launch audit (2026-10-08): description length, hero image priority, favicon.ico, FAQ rows', () => {
  const description = site.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  assert.ok(description.length > 50 && description.length <= 160, `description is ${description.length} characters`);
  assert.match(site, /<img src="\/images\/today-light\.jpg" fetchpriority="high"/, 'the largest paint loads first');
  assert.match(site, /<img src="\/images\/private-light\.jpg" loading="lazy"/, 'below the fold');
  const icon = readFileSync(new URL('../website/favicon.ico', import.meta.url));
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0], 'favicon.ico is an icon file');
  const styles = readFileSync(new URL('../website/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.faq summary \{[^}]*padding: 18px 0;/, 'the whole FAQ row (over 44px) opens the answer');
});

test('every screenshot loads as AVIF first, with the JPEG as fallback, in both themes (pre-launch audit, 2026-10-08)', () => {
  const pictures = site.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  assert.equal(pictures.length, 5);
  for (const picture of pictures) {
    const name = picture.match(/\/images\/([a-z]+)-light\.jpg/)?.[1];
    assert.ok(name, picture);
    assert.ok(picture.indexOf(`/images/${name}-dark.avif`) < picture.indexOf(`/images/${name}-dark.jpg`), name);
    assert.ok(
      picture.indexOf(`/images/${name}-light.avif`) < picture.indexOf(`<img src="/images/${name}-light.jpg"`),
      name,
    );
    for (const file of [`${name}-dark.avif`, `${name}-dark.jpg`, `${name}-light.avif`, `${name}-light.jpg`]) {
      assert.ok(existsSync(new URL(`../website/images/${file}`, import.meta.url)), file);
    }
  }
});

test('the store buttons say "Coming soon" until the App Store ID exists, then link to it (2026-10-08)', () => {
  const links = appStoreLinks(appStoreId);
  if (!links) {
    assert.doesNotMatch(site, /apps\.apple\.com/, 'no link to a listing that does not exist yet');
    assert.equal((site.match(/<span class="store-badge soon">/g) ?? []).length, 2);
    assert.equal((site.match(/Coming soon to the App Store/g) ?? []).length, 2);
  } else {
    assert.equal(
      (site.match(new RegExp(`<a class="store-badge" href="${links.listing}">`, 'g')) ?? []).length,
      2,
      'both buttons link to the live listing',
    );
    assert.doesNotMatch(site, /Coming soon to the App Store/);
  }
});
