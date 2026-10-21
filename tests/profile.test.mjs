import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  greetingName,
  nextGreetingChange,
  profileInitial,
  replacedAvatarPath,
  todayGreeting,
} from '../src/domain/profile.ts';

test('profile initial uses the display name first', () => {
  assert.equal(profileInitial('shkelqim', 'other@example.com'), 'S');
});

test('profile initial ignores leading spaces in the name', () => {
  assert.equal(profileInitial('  ana', undefined), 'A');
});

test('profile initial falls back to the email when no name is saved', () => {
  assert.equal(profileInitial('', 'mira@example.com'), 'M');
  assert.equal(profileInitial('   ', ' mira@example.com'), 'M');
});

test('profile initial is empty when there is no name or email, so the person icon shows', () => {
  assert.equal(profileInitial('', undefined), '');
  assert.equal(profileInitial(undefined, ''), '');
});

test('the Today greeting adds the first name of the saved name', () => {
  assert.equal(todayGreeting(14, 'Mira'), 'Good afternoon, Mira');
  assert.equal(todayGreeting(9, 'Shkelqim Surkishi'), 'Good morning, Shkelqim');
  assert.equal(todayGreeting(20, '  Ëndrit  Berisha '), 'Good evening, Ëndrit');
});

test('the Today greeting has no name and no comma when no name is saved', () => {
  assert.equal(todayGreeting(14, ''), 'Good afternoon');
  assert.equal(todayGreeting(9, '   '), 'Good morning');
  assert.equal(todayGreeting(20, undefined), 'Good evening');
});

test('the Today greeting keeps its morning, afternoon, and evening hours', () => {
  assert.equal(todayGreeting(11, 'Mira'), 'Good morning, Mira');
  assert.equal(todayGreeting(12, 'Mira'), 'Good afternoon, Mira');
  assert.equal(todayGreeting(17, 'Mira'), 'Good afternoon, Mira');
  assert.equal(todayGreeting(18, 'Mira'), 'Good evening, Mira');
});

test('a greeting name shows up to 11 letters in full and cuts longer names with an ellipsis', () => {
  assert.equal(greetingName('Christopher'), 'Christopher');
  assert.equal(greetingName('Maximilianus'), 'Maximilianu…');
  assert.equal(greetingName('Çerkezëllëku'), 'Çerkezëllëk…');
  assert.equal(greetingName(undefined), '');
});

test('a cut greeting name never splits an emoji or a flag in half', () => {
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  assert.equal(greetingName(`Ana${family.repeat(9)}`), `Ana${family.repeat(8)}…`);
  assert.equal(greetingName(`Ana${'\u{1F1FD}\u{1F1F0}'.repeat(9)}`), `Ana${'\u{1F1FD}\u{1F1F0}'.repeat(8)}…`);
  assert.equal(greetingName('Arta\u{1F44B}\u{1F3FD}'), 'Arta\u{1F44B}\u{1F3FD}');
});

test('the spoken greeting keeps the full first name', () => {
  assert.equal(todayGreeting(14, 'Maximilianus Test', Infinity), 'Good afternoon, Maximilianus');
  assert.equal(todayGreeting(14, 'Maximilianus Test'), 'Good afternoon, Maximilianu…');
});

test('the greeting refreshes at noon, at six, and at midnight', () => {
  const at = (hour, minute = 0) => new Date(2026, 9, 1, hour, minute);
  assert.deepEqual(nextGreetingChange(at(9, 30)), at(12));
  assert.deepEqual(nextGreetingChange(at(12)), at(18));
  assert.deepEqual(nextGreetingChange(at(17, 59)), at(18));
  assert.deepEqual(nextGreetingChange(at(20)), new Date(2026, 9, 2, 0, 0));
});

test('a cut greeting name keeps keycap emoji whole', () => {
  const keycap = '1️⃣';
  assert.equal(greetingName(`Ana${keycap.repeat(9)}`), `Ana${keycap.repeat(8)}…`);
});

test("a replaced profile photo is deleted, but only from the account's own profile folder (code review, 2026-10-08)", () => {
  const user = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    replacedAvatarPath(`${user}/profile/avatar-1.jpg`, `${user}/profile/avatar-2.jpg`, user),
    `${user}/profile/avatar-1.jpg`,
  );
  assert.equal(replacedAvatarPath(null, `${user}/profile/avatar-2.jpg`, user), null, 'no photo before');
  assert.equal(
    replacedAvatarPath(`${user}/profile/avatar-1.jpg`, `${user}/profile/avatar-1.jpg`, user),
    null,
    'the photo did not change',
  );
  assert.equal(replacedAvatarPath(`${user}/profile/avatar-1.jpg`, null, user), null, 'nothing new was saved');
  assert.equal(
    replacedAvatarPath(
      '22222222-2222-4222-8222-222222222222/profile/avatar-1.jpg',
      `${user}/profile/avatar-2.jpg`,
      user,
    ),
    null,
    "never another account's file",
  );
  assert.equal(
    replacedAvatarPath(`${user}/entries/e/photo.jpg`, `${user}/profile/avatar-2.jpg`, user),
    null,
    'never a note photo',
  );
});
