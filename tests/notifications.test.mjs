import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { reminders } from '../src/lib/reminders.native.ts';
import { addUpcoming, permission, scheduled, upcomingNotifications } from './support/fake-notifications.mjs';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('a reminder shows only the fixed text, never journal content', async () => {
  const userId = '00000000-0000-4000-8000-0000000000aa';
  assert.deepEqual(await reminders.enable(userId, '20:00'), { error: null });
  assert.equal(scheduled.length, 1);
  assert.deepEqual(scheduled[0].content, {
    body: 'Take a quiet moment and write what is on your mind.',
    data: { kind: 'daily-reminder', url: '/' },
    title: 'Time to reflect',
  });
  assert.deepEqual(scheduled[0].trigger, { hour: 20, minute: 0, type: 'daily' });
  assert.ok(!JSON.stringify(scheduled[0]).includes(userId));
});

test('the reminder API accepts no entry data', () => {
  // Only the user id and time go in, so no note text can reach a notification.
  assert.equal(reminders.enable.length, 2);
  assert.equal(reminders.disable.length, 1);
});

test('only the reminder module can post notifications, and it reads no journal data', () => {
  const posting = sourceFiles(srcRoot)
    .filter((path) => /expo-notifications|Notifications\.(schedule|present)/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(srcRoot, path).split(sep).join('/'));
  assert.deepEqual(posting, ['lib/reminders.native.ts']);
  // A new notification path must be reviewed for the Private boundary and added to this test.
  const reminderSource = readFileSync(join(srcRoot, 'lib/reminders.native.ts'), 'utf8');
  assert.ok(!/from '@\//.test(reminderSource), 'reminders must not import journal, Private, or app state');
});

test('when notifications are declined, nothing is scheduled and the caller is told', async () => {
  const userId = '00000000-0000-4000-8000-0000000000ab';
  await reminders.disable(userId);
  const before = scheduled.length;
  Object.assign(permission, { canAskAgain: false, granted: false, status: 'denied' });
  try {
    assert.deepEqual(await reminders.enable(userId, '20:00'), {
      denied: true,
      error: 'Notification permission was not granted.',
    });
    assert.equal(await reminders.permission(), 'denied');
  } finally {
    Object.assign(permission, { canAskAgain: true, granted: true, status: 'granted' });
  }
  assert.equal(scheduled.length, before);
  assert.equal(upcomingNotifications().length, 0);
});

test('a phone that was never asked reports it, so the app can explain before asking', async () => {
  Object.assign(permission, { canAskAgain: true, granted: false, status: 'undetermined' });
  try {
    assert.equal(await reminders.permission(), 'undetermined');
  } finally {
    Object.assign(permission, { canAskAgain: true, granted: true, status: 'granted' });
  }
  assert.equal(await reminders.permission(), 'granted');
});

test('two reminder changes at the same moment still leave exactly one reminder', async () => {
  const userId = '00000000-0000-4000-8000-0000000000ac';
  await reminders.disable(userId);
  await Promise.all([
    reminders.enable(userId, '20:00'),
    reminders.enable(userId, '21:30'),
    reminders.enable(userId, '07:15'),
  ]);
  const upcoming = upcomingNotifications();
  assert.equal(upcoming.length, 1);
  // The last change wins.
  assert.deepEqual(upcoming[0].trigger, { hour: 7, minute: 15, type: 'daily' });
});

test('the reminder rings at the time the user picked', async () => {
  const userId = '00000000-0000-4000-8000-0000000000ad';
  await reminders.enable(userId, '06:45');
  assert.deepEqual(
    upcomingNotifications().map((request) => request.trigger),
    [{ hour: 6, minute: 45, type: 'daily' }],
  );
});

test('a reminder left by an older build is cancelled too, so it cannot ring forever', async () => {
  const userId = '00000000-0000-4000-8000-0000000000ae';
  await reminders.disable(userId);
  addUpcoming({
    content: {
      body: 'Take a quiet moment and write what is on your mind.',
      data: { url: '/' },
      title: 'Time to reflect',
    },
    trigger: { hour: 20, minute: 0, type: 'daily' },
  });
  addUpcoming({
    content: { body: 'Something else', data: {}, title: 'Not ours' },
    trigger: { hour: 9, minute: 0, type: 'daily' },
  });

  await reminders.disable(userId);

  assert.deepEqual(
    upcomingNotifications().map((request) => request.content.title),
    ['Not ours'],
  );
});
