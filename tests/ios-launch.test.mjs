import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { loadSavedSession } from '../src/lib/auth/load-saved-session.ts';

const appDelegate = readFileSync(new URL('../ios/Bunari/AppDelegate.swift', import.meta.url), 'utf8');
const infoPlist = readFileSync(new URL('../ios/Bunari/Info.plist', import.meta.url), 'utf8');

test('iOS launch adopts Expo scene lifecycle instead of creating a window in AppDelegate', () => {
  assert.match(infoPlist, /<key>UIApplicationSceneManifest<\/key>/);
  assert.match(infoPlist, /<key>UISceneDelegateClassName<\/key>\s*<string>BunariSceneDelegate<\/string>/);
  assert.match(appDelegate, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  // Bunari's scene delegate only adds the privacy cover; Expo's scene delegate still starts React Native.
  assert.match(appDelegate, /@objc\(BunariSceneDelegate\)\s*class BunariSceneDelegate: ExpoAppSceneDelegate/);
  assert.doesNotMatch(appDelegate, /UIWindow\(frame:/);
  assert.doesNotMatch(appDelegate, /factory\.startReactNative\(/);
});

test('the app switcher snapshot is covered while Bunari is in the background', () => {
  assert.match(appDelegate, /override func sceneDidEnterBackground\(_ scene: UIScene\) \{\s*showPrivacyCover\(\)/);
  assert.match(appDelegate, /override func sceneWillEnterForeground[\s\S]*privacyCover\?\.removeFromSuperview\(\)/);
});

test("the app's files stay locked while the iPhone is locked (security audit, 2026-10-08)", () => {
  const entitlements = readFileSync(new URL('../ios/Bunari/Bunari.entitlements', import.meta.url), 'utf8');
  // Regular notes (AsyncStorage) and downloaded photos are readable only while the phone is unlocked.
  assert.match(
    entitlements,
    /<key>com\.apple\.developer\.default-data-protection<\/key>\s*<string>NSFileProtectionComplete<\/string>/,
  );
});

test('saved session loads normally when secure storage succeeds', async () => {
  const session = { accessToken: 'example' };
  const errors = [];
  const restored = await loadSavedSession(
    async () => session,
    (error) => errors.push(error),
  );
  assert.equal(restored, session);
  assert.deepEqual(errors, []);
});

test('saved session failure is reported and resolves to signed-out state', async () => {
  const keychainError = new Error('Keychain unavailable');
  const errors = [];
  const restored = await loadSavedSession(
    async () => {
      throw keychainError;
    },
    (error) => errors.push(error),
  );
  assert.equal(restored, null);
  assert.deepEqual(errors, [keychainError]);
});
