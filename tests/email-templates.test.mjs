import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(new URL(`../supabase/email-templates/${name}`, import.meta.url), 'utf8');

// Supabase's variables for each template (Authentication › Emails; checked 2026-10-07).
const templates = {
  'change-email.html': ['ConfirmationURL', 'Email', 'NewEmail', 'SiteURL'],
  'confirm-signup.html': ['ConfirmationURL', 'Email', 'SiteURL'],
  'email-changed.html': ['Email', 'OldEmail', 'SiteURL'],
  'password-changed.html': ['Email', 'SiteURL'],
  'reset-password.html': ['ConfirmationURL', 'Email', 'SiteURL'],
};

test('every template is a plain inline-styled page that names Bunari, its website and the contact address', () => {
  for (const name of Object.keys(templates)) {
    const html = read(name);
    assert.match(html, /^<!doctype html>/, name);
    assert.ok(!/<style|<script|<link /i.test(html), `${name}: inline styles only`);
    assert.match(html, /<a href="https:\/\/bunari\.app"/, name);
    assert.match(html, /mailto:contact@bunari\.app/, name);
    assert.ok(!html.includes('pages.dev'), name);
  }
});

test('each template uses only the variables Supabase gives it', () => {
  for (const [name, allowed] of Object.entries(templates)) {
    const used = [...read(name).matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((match) => match[1]);
    for (const variable of used) assert.ok(allowed.includes(variable), `${name} uses .${variable}`);
  }
  assert.match(read('change-email.html'), /\{\{ \.NewEmail \}\}/);
  assert.match(
    read('email-changed.html'),
    /from <strong>\{\{ \.OldEmail \}\}<\/strong> to <strong>\{\{ \.Email \}\}<\/strong>/,
  );
});

test('emails with a button say to open them on the iPhone; the security notices have no button', () => {
  for (const name of ['confirm-signup.html', 'reset-password.html', 'change-email.html']) {
    // Through the website's Continue page, so email scanners cannot use up the one-time link.
    assert.match(read(name), /href="https:\/\/bunari\.app\/link#\{\{ \.ConfirmationURL \}\}"/, name);
    assert.match(read(name), /Open this email on the iPhone where Bunari is installed/, name);
  }
  for (const name of ['password-changed.html', 'email-changed.html']) {
    assert.ok(!read(name).includes('ConfirmationURL'), name);
    assert.match(read(name), /If it wasn't/, name);
  }
});

test('the guide lists every template with its subject', () => {
  const guide = read('README.md');
  for (const name of Object.keys(templates))
    assert.match(guide, new RegExp(`\`${name.replace('.', '\\.')}\` \\| \`[^\`]+\``), name);
});
