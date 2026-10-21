// Account screen (the "more" tab): profile, settings, AI permission, sync status, Private PIN, trips, export, help, and account actions
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  AtSign,
  Bell,
  Camera,
  Check,
  Clock,
  Copy,
  Download,
  Eraser,
  FileText,
  Globe,
  Info,
  KeyRound,
  KeySquare,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Mail,
  MailCheck,
  Moon,
  Plane,
  RefreshCw,
  Save,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { usePhotoPicker } from '@/components/photos/photo-picker';
import { AppText } from '@/components/ui/app-text';
import { ReminderTimePicker } from '@/components/settings/reminder-time-picker';
import { ChangeEmailSheet, ChangePasswordSheet } from '@/components/settings/account-sheets';
import { SettingsBlock, SettingsRow, SettingsSection } from '@/components/settings/settings-list';
import { ThemePickerSheet } from '@/components/settings/theme-picker-sheet';
import { Screen } from '@/components/ui/screen';
import { appStoreId, appStoreLinks } from '@/config/app-store';
import { supportEmail, websiteLinks } from '@/config/website';
import { mediaCache } from '@/data/media-cache';
import { aiPermissionSummary } from '@/domain/ai-permission';
import { formatBytes, unusedDownloadedCopies } from '@/domain/media-cleanup';
import { profileInitial } from '@/domain/profile';
import { useAiPermission } from '@/hooks/use-ai-permission';
import { appVersionLabel, supportMailUrl } from '@/domain/support';
import { requestAppleIdentityToken } from '@/lib/auth/apple-reauth';
import { exportJournal } from '@/lib/export/export-journal';
import { useAuth } from '@/state/auth-context';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { usePrompts } from '@/state/prompt-context';
import { useSettings } from '@/state/settings-context';
import { colors, fontFamilies, radii, spacing } from '@/theme/tokens';

export default function MoreScreen() {
  const router = useRouter();
  const { changeEmail, changePassword, deleteProfile, signOut, user } = useAuth();
  const {
    deletedEntries,
    dismissSyncIssue,
    entries,
    folders,
    pendingChangeCount,
    retrySync,
    syncIssues,
    syncStatus,
    trips,
  } = useJournal();
  const {
    biometricAvailable,
    changePin,
    configuration,
    deletedRecordCount: privateDeletedRecordCount,
    dismissSyncIssue: dismissPrivateSyncIssue,
    pendingChangeCount: privatePendingChangeCount,
    resetPinWithBiometrics,
    retrySync: retryPrivateSync,
    setBiometricEnabled,
    status: privateStatus,
    syncIssues: privateSyncIssues,
    syncStatus: privateSyncStatus,
  } = usePrivateJournal();
  const {
    pendingChangeCount: promptPendingChangeCount,
    retrySync: retryPromptSync,
    syncError: promptSyncError,
    syncStatus: promptSyncStatus,
  } = usePrompts();
  const settings = useSettings();
  const askForAi = useAiPermission();
  const pickPhotos = usePhotoPicker();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{ mimeType: string; uri: string } | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [changePinRequested, setChangePinRequested] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [photoAccess, setPhotoAccess] = useState<'all' | 'limited' | 'none' | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [accountSheet, setAccountSheet] = useState<'email' | 'password' | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void ImagePicker.getMediaLibraryPermissionsAsync(false).then((permission) => {
        if (active) setPhotoAccess(permission.accessPrivileges ?? (permission.granted ? 'all' : 'none'));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  async function run(action: string, task: () => Promise<{ error: string | null }>, success?: string) {
    setError(null);
    setLoadingAction(action);
    const result = await task();
    setLoadingAction(null);
    if (result.error) setError(result.error);
    else if (success) Alert.alert(success);
  }

  // The profile photo comes from Bunari's own picker, which shows only the photos the user allowed.
  async function chooseAvatar() {
    const [photo] = await pickPhotos({ max: 1, title: 'Profile photo' });
    if (photo) setAvatar(photo);
  }

  async function copyEmail(email: string) {
    await Clipboard.setStringAsync(email);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AccessibilityInfo.announceForAccessibility('Email copied');
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }

  // Writes to support with the app and iOS versions filled in; without a support email, opens the
  // website's support page.
  async function contactSupport() {
    if (!supportEmail) {
      await openWebsite(websiteLinks.support);
      return;
    }
    const url = supportMailUrl(supportEmail, {
      appVersion: Application.nativeApplicationVersion ?? 'unknown',
      buildNumber: Application.nativeBuildVersion ?? 'unknown',
      osVersion: String(Platform.Version),
    });
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No email app', `Write to ${supportEmail} from any email app.`);
    }
  }

  // Removes downloaded photo copies that no note (including Recently Deleted) shows anymore. Photos
  // picked on this device and every photo a note still shows are kept, so nothing changes on screen.
  async function clearUnusedPhotoCopies() {
    if (!user) return;
    const shownUris = [...entries, ...deletedEntries].flatMap((entry) => [
      entry.coverUri,
      ...entry.attachments.map((attachment) => attachment.uri),
    ]);
    let unused;
    try {
      unused = unusedDownloadedCopies(await mediaCache.localCopies(user.id), shownUris);
    } catch {
      setError('Photo copies could not be checked. Try again.');
      return;
    }
    if (unused.length === 0) {
      Alert.alert('Nothing to clear', 'Every photo copy on this iPhone is still used by a note.');
      return;
    }
    const size = formatBytes(unused.reduce((total, copy) => total + copy.size, 0));
    Alert.alert(
      'Clear unused photo copies?',
      `Frees ${size} on this iPhone. These are copies of photos that no note uses anymore; your notes and their photos are not touched.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () =>
            void run(
              'clear-photos',
              async () => {
                await mediaCache.deleteCopies(unused.map((copy) => copy.uri));
                return { error: null };
              },
              `${size} freed`,
            ),
          style: 'destructive',
          text: 'Clear',
        },
      ],
    );
  }

  async function submitPinChange(withFaceId = false) {
    setPinError(null);
    if (newPin !== confirmPin) {
      setPinError('The new PINs do not match.');
      return;
    }
    setLoadingAction('change-pin');
    const result = withFaceId ? await resetPinWithBiometrics(newPin) : await changePin(currentPin, newPin);
    setLoadingAction(null);
    if (result.error) {
      setPinError(result.error);
      return;
    }
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinModalOpen(false);
    setChangePinRequested(false);
    Alert.alert(withFaceId ? 'Private PIN reset' : 'Private PIN changed');
  }

  function closePinModal() {
    setPinModalOpen(false);
    setChangePinRequested(false);
  }

  // Signing out keeps this account's notes and unsynced changes on the iPhone; they sync after the
  // next sign-in with the same account.
  function confirmSignOut() {
    const unsynced = pendingChangeCount + privatePendingChangeCount + promptPendingChangeCount;
    Alert.alert(
      'Sign out?',
      unsynced > 0
        ? `${unsynced} ${unsynced === 1 ? 'change has' : 'changes have'} not synced yet. ${unsynced === 1 ? 'It stays' : 'They stay'} on this iPhone and ${unsynced === 1 ? 'syncs' : 'sync'} when you sign in again with this account.`
        : 'You can sign in again at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void run('sign-out', signOut) },
      ],
    );
  }

  function confirmDeleteProfile() {
    Alert.alert(
      'Delete profile permanently?',
      'This deletes your account, journals, trips, photos, settings, and encrypted Private data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Profile',
          style: 'destructive',
          // The next dialog opens once this one has finished closing; iOS will not present over it.
          onPress: () => setTimeout(confirmAccountOwner, 400),
        },
      ],
    );
  }

  // Deleting needs the account password (or, for accounts linked to Sign in with Apple, signing in
  // with Apple again), so someone holding an unlocked phone cannot delete the profile.
  function confirmAccountOwner() {
    if (Platform.OS !== 'ios') {
      setError('Delete your profile from the Bunari iPhone app.');
      return;
    }
    if (usesPassword && usesApple) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 2,
          options: ['Enter password', 'Sign in with Apple', 'Cancel'],
          title: 'Confirm it is your account',
        },
        (index) => {
          if (index === 0) setTimeout(askForPassword, 400);
          else if (index === 1) setTimeout(confirmWithApple, 400);
        },
      );
      return;
    }
    if (usesPassword) askForPassword();
    else confirmWithApple();
  }

  function confirmWithApple() {
    void run('delete-profile', async () => {
      const apple = await requestAppleIdentityToken();
      if (!apple.token)
        return {
          error: apple.cancelled
            ? 'Profile deletion was cancelled.'
            : 'Sign in with Apple is needed to delete this profile.',
        };
      return deleteProfile({ appleAuthorizationCode: apple.authorizationCode, appleIdentityToken: apple.token });
    });
  }

  function askForPassword() {
    Alert.prompt(
      'Enter your password',
      'Confirm your Bunari account password to delete your profile.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: (password?: string) => {
            if (!password) {
              setError('Enter your password to delete your profile.');
              return;
            }
            void run('delete-profile', () => deleteProfile({ password }));
          },
          style: 'destructive',
          text: 'Delete',
        },
      ],
      'secure-text',
    );
  }

  // How this account signs in: email and password, Sign in with Apple, or both.
  const providers = user?.app_metadata?.providers;
  const linkedProviders: string[] = Array.isArray(providers)
    ? providers
    : [user?.app_metadata?.provider].filter((value): value is string => typeof value === 'string');
  const usesPassword = linkedProviders.includes('email');
  const usesApple = linkedProviders.includes('apple');
  const avatarUri = avatar?.uri ?? settings.avatarUrl;
  const currentDisplayName = displayName ?? settings.displayName;
  const initial = profileInitial(currentDisplayName, user?.email);
  const faceIdEnabled = Boolean(configuration?.biometricEnabled);
  const syncIsRunning = syncStatus === 'syncing' || privateSyncStatus === 'syncing' || promptSyncStatus === 'syncing';
  const syncHasError = syncStatus === 'error' || privateSyncStatus === 'error' || promptSyncStatus === 'error';
  const syncIsOffline = syncStatus === 'offline' || privateSyncStatus === 'offline' || promptSyncStatus === 'offline';
  const recentlyDeletedCount = deletedEntries.length + privateDeletedRecordCount;
  // Share and Rate appear once the app is live on the App Store.
  const storeLinks = appStoreLinks(appStoreId);
  const pendingDetails = [
    pendingChangeCount > 0 ? `${pendingChangeCount} pending ${pendingChangeCount === 1 ? 'change' : 'changes'}` : null,
    privatePendingChangeCount > 0
      ? `${privatePendingChangeCount} encrypted Private ${privatePendingChangeCount === 1 ? 'change' : 'changes'} pending`
      : null,
    promptPendingChangeCount > 0
      ? `${promptPendingChangeCount} prompt favorite ${promptPendingChangeCount === 1 ? 'change' : 'changes'} pending`
      : null,
  ].filter((line): line is string => line !== null);
  const photoAccessDescription =
    photoAccess === 'all'
      ? 'Bunari can see your whole photo library. To allow only some photos, choose Limited Access in iOS Settings › Bunari › Photos.'
      : photoAccess === 'limited'
        ? 'Bunari can see only the photos you allowed. Add more from the photo picker with "Allow more photos".'
        : 'Bunari cannot see your photos yet. The first time you add a photo, choose Limited Access and pick the photos Bunari may use.';

  return (
    <Screen scroll style={styles.screen}>
      <View>
        <AppText color="accent" variant="label">
          PROFILE & SETTINGS
        </AppText>
        <AppText style={styles.title} variant="screenTitle">
          Account
        </AppText>
      </View>

      <SettingsSection title="Profile">
        <SettingsBlock>
          <View style={styles.profileRow}>
            <Pressable
              accessibilityLabel="Choose profile photo"
              accessibilityRole="button"
              onPress={() => void chooseAvatar()}
              style={styles.avatarButton}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : initial ? (
                <AppText style={styles.avatarInitial}>{initial}</AppText>
              ) : (
                <UserRound color={colors.text} size={26} />
              )}
              <View style={styles.cameraBadge}>
                <Camera color={colors.onAccent} size={13} />
              </View>
            </Pressable>
            <View style={styles.profileFields}>
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Display name"
                defaultValue={settings.displayName}
                key={settings.displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
            </View>
          </View>
        </SettingsBlock>
        <SettingsRow
          chevron={false}
          disabled={Boolean(loadingAction)}
          icon={Save}
          label={loadingAction === 'profile' ? 'Saving…' : 'Save profile'}
          onPress={() => void run('profile', () => settings.saveProfile(currentDisplayName, avatar), 'Profile saved')}
        />
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          disabled={Boolean(loadingAction)}
          icon={settings.theme === 'light' ? Sun : Moon}
          label="Theme"
          onPress={() => setThemeSheetOpen(true)}
          value={settings.theme === 'light' ? 'Warm light' : 'Dark'}
        />
      </SettingsSection>

      <SettingsSection title="Accessibility">
        <SettingsRow
          detail="Bigger text and titles in your notes, on this iPhone."
          icon={Type}
          label="Larger note text"
          onSwitchChange={(large) => settings.setNoteTextSize(large ? 'large' : 'standard')}
          switchValue={settings.noteTextSize === 'large'}
        />
      </SettingsSection>

      <SettingsSection title="Private journal">
        {configuration ? (
          <SettingsRow
            detail={
              Platform.OS !== 'ios'
                ? 'Face ID settings are available on iPhone.'
                : privateStatus !== 'unlocked' && !faceIdEnabled
                  ? 'Unlock Private before enabling Face ID.'
                  : 'Private remains hidden and encrypted.'
            }
            disabled={Platform.OS !== 'ios' || !biometricAvailable || Boolean(loadingAction)}
            icon={LockKeyhole}
            label="Face ID for Private"
            onSwitchChange={(enabled) => void run('face-id', () => setBiometricEnabled(enabled))}
            switchValue={faceIdEnabled}
          />
        ) : (
          <SettingsRow
            detail="Private remains hidden and encrypted."
            icon={LockKeyhole}
            label="Set up Private"
            onPress={() => router.push('/private')}
          />
        )}
        {configuration ? (
          <SettingsRow
            disabled={Boolean(loadingAction)}
            icon={KeyRound}
            label={privateStatus === 'unlocked' ? 'Change Private PIN' : 'Unlock to change PIN'}
            onPress={() => {
              if (privateStatus !== 'unlocked') {
                setChangePinRequested(true);
                router.push({ pathname: '/private', params: { returnTo: 'change-pin' } });
              } else setPinModalOpen(true);
            }}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Daily reminder">
        <SettingsRow
          detail={
            settings.reminderAvailable
              ? 'A private local reminder on your device.'
              : 'Reminders are available in the iPhone app.'
          }
          disabled={!settings.reminderAvailable || Boolean(loadingAction)}
          icon={Bell}
          label="Daily prompt reminder"
          onSwitchChange={(enabled) => void run('reminder', () => settings.setReminder(enabled, settings.reminderTime))}
          switchValue={settings.reminderEnabled}
        />
        {settings.reminderEnabled && settings.reminderAvailable ? (
          <SettingsRow
            icon={Clock}
            label="Time"
            trailing={
              <ReminderTimePicker
                onChange={(time) => void run('reminder-time', () => settings.setReminder(true, time))}
                value={settings.reminderTime}
              />
            }
          />
        ) : null}
        {settings.reminderEnabled && settings.reminderPermission === 'denied' ? (
          <SettingsBlock>
            <AppText color="dim" variant="caption">
              Notifications are off for Bunari in iPhone Settings, so this iPhone will not remind you. Your other
              devices still will.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={styles.noticeButton}
            >
              <AppText color="accent" variant="caption">
                Open Settings
              </AppText>
            </Pressable>
          </SettingsBlock>
        ) : null}
        {settings.reminderEnabled && settings.reminderPermission === 'undetermined' ? (
          <SettingsBlock>
            <AppText color="dim" variant="caption">
              Allow notifications to get the reminder on this iPhone.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void run('reminder-allow', settings.allowReminderNotifications)}
              style={styles.noticeButton}
            >
              <AppText color="accent" variant="caption">
                Allow notifications
              </AppText>
            </Pressable>
          </SettingsBlock>
        ) : null}
      </SettingsSection>

      <SettingsSection footer={aiPermissionSummary} title="AI">
        <SettingsRow
          icon={Sparkles}
          label="AI on your entries"
          // Turning it on shows the same question as the first mood suggestion or Weekly Insight.
          onSwitchChange={(allowed) => {
            if (allowed) void askForAi();
            else settings.setAiFeaturesAllowed(false);
          }}
          switchValue={settings.aiFeaturesAllowed}
        />
      </SettingsSection>

      {Platform.OS === 'ios' ? (
        <SettingsSection footer={photoAccessDescription} title="Photos">
          <SettingsRow
            icon={Camera}
            label="Photo access"
            onPress={() => void Linking.openSettings()}
            value={
              photoAccess === 'all'
                ? 'All photos'
                : photoAccess === 'limited'
                  ? 'Limited'
                  : photoAccess === 'none'
                    ? 'None'
                    : undefined
            }
          />
        </SettingsSection>
      ) : null}

      <SettingsSection
        footer="Export creates a readable journal document with your regular entries and trips. Private entries are never included."
        title="Your data"
      >
        <SettingsRow
          chevron={false}
          disabled={Boolean(loadingAction)}
          icon={Download}
          label={loadingAction === 'export' ? 'Preparing…' : 'Export readable journal'}
          onPress={() => void run('export', () => exportJournal(entries, trips, folders), 'Export ready')}
        />
        <SettingsRow
          icon={Trash2}
          label="Recently Deleted"
          onPress={() => router.push('/recently-deleted' as Href)}
          value={recentlyDeletedCount > 0 ? String(recentlyDeletedCount) : undefined}
        />
        <SettingsRow
          detail="Collect entries by trip and date range. Trip entries are saved in Notes."
          icon={Plane}
          label="Trips"
          onPress={() => router.push('/travel')}
          value={trips.length > 0 ? String(trips.length) : undefined}
        />
      </SettingsSection>

      <SettingsSection title="Sync">
        <SettingsRow
          chevron={false}
          detail={pendingDetails.length > 0 ? pendingDetails.join('\n') : undefined}
          disabled={Boolean(loadingAction) || syncIsRunning}
          icon={RefreshCw}
          label={syncIsRunning ? 'Syncing…' : syncHasError ? 'Retry now' : 'Sync now'}
          onPress={() => {
            retrySync();
            retryPrivateSync();
            retryPromptSync();
          }}
          value={
            syncIsRunning ? undefined : syncIsOffline ? 'Offline' : syncHasError ? 'Needs attention' : 'Up to date'
          }
        />
        {syncIssues.map((issue) => (
          <SettingsBlock key={issue.id}>
            <View style={styles.syncIssue}>
              <AppText color="dim" style={styles.syncIssueText} variant="caption">
                {issue.message}
              </AppText>
              <Pressable
                accessibilityLabel="Dismiss sync message"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => dismissSyncIssue(issue.id)}
              >
                <X color={colors.textDim} size={17} />
              </Pressable>
            </View>
          </SettingsBlock>
        ))}
        {privateSyncIssues.map((issue) => (
          <SettingsBlock key={issue.id}>
            <View style={styles.syncIssue}>
              <AppText color="dim" style={styles.syncIssueText} variant="caption">
                {issue.message}
              </AppText>
              <Pressable
                accessibilityLabel="Dismiss Private sync message"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => dismissPrivateSyncIssue(issue.id)}
              >
                <X color={colors.textDim} size={17} />
              </Pressable>
            </View>
          </SettingsBlock>
        ))}
        {promptSyncError ? (
          <SettingsBlock>
            <AppText color="dim" variant="caption">
              Prompt favorites could not sync. {promptSyncError}
            </AppText>
          </SettingsBlock>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Help and about">
        <SettingsRow
          detail="Common questions and how Bunari works"
          icon={LifeBuoy}
          label="Help"
          onPress={() => void openWebsite(websiteLinks.support)}
        />
        <SettingsRow icon={Mail} label="Contact Support" onPress={() => void contactSupport()} />
        <SettingsRow icon={Globe} label="Website" onPress={() => void openWebsite(websiteLinks.home)} />
        {storeLinks ? (
          <SettingsRow
            icon={Share2}
            label="Share Bunari"
            onPress={() =>
              void Share.share({ message: 'Bunari, a private journal', url: storeLinks.listing }).catch(() => undefined)
            }
          />
        ) : null}
        {storeLinks ? (
          <SettingsRow
            icon={Star}
            label="Rate in the App Store"
            onPress={() =>
              void Linking.openURL(storeLinks.review)
                .catch(() => Linking.openURL(storeLinks.listing))
                .catch(() => undefined)
            }
          />
        ) : null}
        <SettingsRow icon={ShieldCheck} label="Privacy policy" onPress={() => void openWebsite(websiteLinks.privacy)} />
        <SettingsRow icon={FileText} label="Terms of use" onPress={() => void openWebsite(websiteLinks.terms)} />
        <SettingsRow
          icon={Info}
          label="Version"
          value={appVersionLabel(Application.nativeApplicationVersion, Application.nativeBuildVersion)}
        />
      </SettingsSection>

      <SettingsSection title="Account">
        {user?.email ? (
          <SettingsRow
            accessibilityHint="Copies your email"
            accessibilityLabel={`Email, ${user.email}`}
            chevron={false}
            detail={user.new_email ? `${user.email}\nWaiting for you to confirm ${user.new_email}` : user.email}
            icon={AtSign}
            label="Email"
            onPress={() => void copyEmail(user.email ?? '')}
            trailing={
              emailCopied ? (
                <Check color={colors.accent} size={18} strokeWidth={2} />
              ) : (
                <Copy color={colors.textDim} size={18} strokeWidth={1.8} />
              )
            }
          />
        ) : null}
        {/* Accounts created with Sign in with Apple have no Bunari password and use Apple's email. */}
        {usesPassword ? (
          <SettingsRow
            disabled={Boolean(loadingAction)}
            icon={MailCheck}
            label="Change email"
            onPress={() => setAccountSheet('email')}
          />
        ) : null}
        {usesPassword ? (
          <SettingsRow
            disabled={Boolean(loadingAction)}
            icon={KeySquare}
            label="Change password"
            onPress={() => setAccountSheet('password')}
          />
        ) : null}
        {error ? (
          <SettingsBlock>
            <AppText style={styles.error}>{error}</AppText>
          </SettingsBlock>
        ) : null}
        <SettingsRow
          chevron={false}
          disabled={Boolean(loadingAction)}
          icon={LogOut}
          label={loadingAction === 'sign-out' ? 'Signing out…' : 'Sign out'}
          onPress={confirmSignOut}
        />
        <SettingsRow
          chevron={false}
          disabled={Boolean(loadingAction)}
          icon={Trash2}
          label={loadingAction === 'delete-profile' ? 'Deleting profile…' : 'Delete Profile'}
          onPress={confirmDeleteProfile}
          tone="danger"
        />
      </SettingsSection>

      <SettingsSection title="Advanced">
        <SettingsRow
          chevron={false}
          detail="Frees space taken by copies of photos that no note uses anymore."
          // Not while syncing: a photo being downloaded for a note would not count as used yet.
          disabled={Boolean(loadingAction) || syncIsRunning}
          icon={Eraser}
          label={loadingAction === 'clear-photos' ? 'Clearing…' : 'Clear unused photo copies'}
          onPress={() => void clearUnusedPhotoCopies()}
        />
      </SettingsSection>

      <ChangeEmailSheet
        currentEmail={user?.email ?? null}
        onClose={() => setAccountSheet(null)}
        onSubmit={changeEmail}
        visible={accountSheet === 'email'}
      />
      <ChangePasswordSheet
        onClose={() => setAccountSheet(null)}
        // After the sheet has closed: iOS does not show an alert over a closing sheet.
        onDone={() =>
          setTimeout(() => Alert.alert('Password changed', 'Use your new password the next time you sign in.'), 400)
        }
        onSubmit={changePassword}
        visible={accountSheet === 'password'}
      />

      <ThemePickerSheet
        onClose={() => setThemeSheetOpen(false)}
        onSelect={(theme) => {
          setThemeSheetOpen(false);
          if (theme !== settings.theme) void run('theme', () => settings.setTheme(theme));
        }}
        selected={settings.theme}
        visible={themeSheetOpen}
      />

      <Modal
        animationType="slide"
        onRequestClose={closePinModal}
        transparent
        visible={pinModalOpen || (changePinRequested && privateStatus === 'unlocked')}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
          <Pressable accessible={false} onPress={closePinModal} style={styles.backdrop}>
            <Pressable
              accessible={false}
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={styles.pinSheet}
            >
              <View style={styles.pinHeader}>
                <AppText variant="cardTitle">Change Private PIN</AppText>
                <Pressable
                  accessibilityLabel="Close PIN form"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={closePinModal}
                >
                  <X color={colors.textDim} size={20} />
                </Pressable>
              </View>
              <AppText color="dim" variant="caption">
                Your encrypted entries and recovery key will stay the same.
              </AppText>
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Current Private PIN"
                inputMode="numeric"
                autoComplete="off"
                textContentType="oneTimeCode"
                maxLength={12}
                onChangeText={setCurrentPin}
                placeholder="Current PIN"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                style={styles.input}
                value={currentPin}
              />
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="New Private PIN"
                inputMode="numeric"
                autoComplete="off"
                textContentType="oneTimeCode"
                maxLength={12}
                onChangeText={setNewPin}
                placeholder="New PIN (at least 6 digits)"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                style={styles.input}
                value={newPin}
              />
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Confirm new Private PIN"
                inputMode="numeric"
                autoComplete="off"
                textContentType="oneTimeCode"
                maxLength={12}
                onChangeText={setConfirmPin}
                placeholder="Confirm new PIN"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                style={styles.input}
                value={confirmPin}
              />
              {pinError ? (
                <AppText style={styles.error} variant="caption">
                  {pinError}
                </AppText>
              ) : null}
              <ActionButton
                disabled={loadingAction === 'change-pin'}
                icon={<KeyRound color={colors.accent} size={18} />}
                label={loadingAction === 'change-pin' ? 'Changing…' : 'Change PIN'}
                onPress={() => void submitPinChange()}
              />
              {configuration?.biometricEnabled && biometricAvailable && (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingAction === 'change-pin'}
                  onPress={() => void submitPinChange(true)}
                  style={styles.pinReset}
                >
                  <AppText color="accent" variant="caption">
                    Forgot current PIN? Set the new PIN with Face ID
                  </AppText>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

// Opens a website page in a browser sheet inside the app.
async function openWebsite(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.accent,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    Alert.alert('Could not open the page', 'Check your connection and try again.');
  }
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  tone = 'accent',
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {icon}
      <AppText color={tone} style={styles.actionText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[5], paddingBottom: 96, paddingTop: spacing[5] },
  title: { marginTop: spacing[2] },
  profileRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[4] },
  profileFields: { flex: 1, gap: spacing[2] },
  avatarButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 29,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  avatarImage: { borderRadius: 29, height: 58, width: 58 },
  avatarInitial: { fontFamily: fontFamilies.heading.semiBold, fontSize: 21 },
  cameraBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    bottom: -1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 24,
  },
  pinReset: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  noticeButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  action: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
    minHeight: 44,
  },
  actionText: { fontFamily: fontFamilies.body.semiBold },
  error: { color: '#d77777', fontSize: 13, lineHeight: 18 },
  syncIssue: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  syncIssueText: { flex: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  modalKeyboard: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.68)', flex: 1, justifyContent: 'flex-end' },
  pinSheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderTopWidth: 1,
    gap: spacing[3],
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
  },
  pinHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
