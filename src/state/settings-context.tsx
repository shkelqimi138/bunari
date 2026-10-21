// Settings provider: theme, reminders, AI permission, and other user preferences
import { File } from 'expo-file-system';
import { type PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Appearance } from 'react-native';

import { readLocalJson, writeLocalJson } from '@/data/local-store';
import { aiFeaturesAllowed } from '@/domain/ai-permission';
import { noteTextSizeOf, type NoteTextSize } from '@/domain/note-text';
import { replacedAvatarPath } from '@/domain/profile';
import { defaultReminderTime, normalizeReminderTime, reminderAction, type ReminderPermission } from '@/domain/reminder';
import { storageLimitMessage } from '@/domain/storage-limits';
import { reminders } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth-context';
import { applyWebTheme, type AppTheme } from '@/theme/tokens';

type SettingsState = {
  // This device only: the user allowed AI features to send regular entries to OpenAI (Account › AI).
  aiFeaturesAllowed?: boolean;
  avatarPath: string | null;
  avatarUrl: string | null;
  displayName: string;
  // This device only: "Larger note text" in Account.
  noteTextSize?: NoteTextSize;
  reminderEnabled: boolean;
  // This device only: the user chose "Not now" on the card that offers the reminder.
  reminderPromptDismissed?: boolean;
  reminderTime: string;
  theme: AppTheme;
};

type ActionResult = { error: string | null };

type SettingsContextValue = SettingsState & {
  aiFeaturesAllowed: boolean;
  loading: boolean;
  // Asks for notification permission (from a tap) and schedules the reminder on this device.
  allowReminderNotifications: () => Promise<ActionResult>;
  // Hides the card that offers the reminder, on this device.
  dismissReminderPrompt: () => void;
  reminderAvailable: boolean;
  // This device's notification permission; null until it is known.
  reminderPermission: ReminderPermission | null;
  noteTextSize: NoteTextSize;
  saveProfile: (displayName: string, avatar?: { mimeType: string; uri: string }) => Promise<ActionResult>;
  // Allows or turns off the AI features that send entries, on this device.
  setAiFeaturesAllowed: (allowed: boolean) => void;
  // Larger or standard note text, on this device.
  setNoteTextSize: (size: NoteTextSize) => void;
  setReminder: (enabled: boolean, time: string) => Promise<ActionResult>;
  setTheme: (theme: AppTheme) => Promise<ActionResult>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);
const defaultState: SettingsState = {
  avatarPath: null,
  avatarUrl: null,
  displayName: '',
  // On by default (user, 2026-10-02); an account's own setting replaces this once it loads.
  reminderEnabled: true,
  reminderTime: defaultReminderTime,
  theme: 'dark',
};

function storageKey(userId: string) {
  return `settings.v1.${userId}`;
}

async function signedAvatarUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from('journal-media').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function applyTheme(theme: AppTheme) {
  Appearance.setColorScheme(theme);
  applyWebTheme(theme);
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [state, setState] = useState<SettingsState>(defaultState);
  const [loading, setLoading] = useState(true);
  // The user whose own settings (saved on this device or loaded from the account) are in `state`;
  // until then the defaults are not acted on.
  const [settingsUserId, setSettingsUserId] = useState<string | null>(null);
  const [reminderPermission, setReminderPermission] = useState<ReminderPermission | null>(null);
  // Bumped when the app returns to the foreground, so a permission changed in iPhone Settings counts.
  const [foregroundCount, setForegroundCount] = useState(0);

  useEffect(() => {
    let active = true;
    const userId = user?.id;
    if (!userId) return;
    void (async () => {
      const local = await readLocalJson<SettingsState>(storageKey(userId));
      if (active && local) {
        setState(local);
        applyTheme(local.theme);
        setSettingsUserId(userId);
      }
      const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from('profiles').select('display_name,avatar_path').eq('id', userId).maybeSingle(),
        supabase
          .from('user_settings')
          .select('theme,daily_prompt_reminder_enabled,daily_prompt_reminder_time')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (!active) return;
      const avatarPath = profile?.avatar_path ?? local?.avatarPath ?? null;
      const next: SettingsState = {
        aiFeaturesAllowed: local?.aiFeaturesAllowed,
        avatarPath,
        avatarUrl: await signedAvatarUrl(avatarPath),
        displayName: profile?.display_name ?? local?.displayName ?? user.user_metadata.full_name ?? '',
        noteTextSize: local?.noteTextSize,
        reminderEnabled: settings?.daily_prompt_reminder_enabled ?? local?.reminderEnabled ?? false,
        reminderPromptDismissed: local?.reminderPromptDismissed,
        reminderTime: normalizeReminderTime(settings?.daily_prompt_reminder_time ?? local?.reminderTime),
        theme: settings?.theme === 'light' ? 'light' : settings?.theme === 'dark' ? 'dark' : (local?.theme ?? 'dark'),
      };
      if (!active) return;
      setState(next);
      applyTheme(next.theme);
      setSettingsUserId(userId);
      await writeLocalJson(storageKey(userId), next);
      setLoading(false);
    })().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const updateLocal = useCallback(
    (next: SettingsState) => {
      setState(next);
      if (user) void writeLocalJson(storageKey(user.id), next);
    },
    [user],
  );

  const setTheme = useCallback(
    async (theme: AppTheme): Promise<ActionResult> => {
      if (!user) return { error: 'Sign in first.' };
      const next = { ...state, theme };
      updateLocal(next);
      applyTheme(theme);
      const { error } = await supabase.from('user_settings').upsert({ theme, user_id: user.id });
      return { error: error?.message ?? null };
    },
    [state, updateLocal, user],
  );

  // Saves the account's reminder setting; the effect below schedules or cancels it on this device.
  // Switching it on from a tap asks for notification permission when it was never asked.
  const setReminder = useCallback(
    async (enabled: boolean, time: string): Promise<ActionResult> => {
      if (!user) return { error: 'Sign in first.' };
      const cleanTime = normalizeReminderTime(time);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const { error } = await supabase.from('user_settings').upsert({
        daily_prompt_reminder_enabled: enabled,
        daily_prompt_reminder_time: `${cleanTime}:00`,
        timezone,
        user_id: user.id,
      });
      if (error) return { error: error.message };
      updateLocal({ ...state, reminderEnabled: enabled, reminderTime: cleanTime });
      if (enabled && reminders.available && (await reminders.permission()) === 'undetermined') {
        await reminders.enable(user.id, cleanTime);
        setReminderPermission(await reminders.permission());
      }
      return { error: null };
    },
    [state, updateLocal, user],
  );

  const allowReminderNotifications = useCallback(async (): Promise<ActionResult> => {
    if (!user || !reminders.available) return { error: 'Daily reminders are available in the iOS app.' };
    const result = await reminders.enable(user.id, state.reminderTime);
    setReminderPermission(await reminders.permission());
    return { error: result.denied ? null : result.error };
  }, [state.reminderTime, user]);

  const dismissReminderPrompt = useCallback(() => {
    updateLocal({ ...state, reminderPromptDismissed: true });
  }, [state, updateLocal]);

  const setNoteTextSize = useCallback(
    (noteTextSize: NoteTextSize) => {
      updateLocal({ ...state, noteTextSize });
    },
    [state, updateLocal],
  );

  const setAiFeaturesAllowed = useCallback(
    (allowed: boolean) => {
      updateLocal({ ...state, aiFeaturesAllowed: allowed });
    },
    [state, updateLocal],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setForegroundCount((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  // Every device follows the account's reminder setting: once the settings load, and whenever the app
  // returns to the foreground, the reminder is scheduled or cancelled here, so one switched on one
  // iPhone also rings on the others. Without notification permission this phone only goes without;
  // the account keeps its setting. Permission is never asked for here, only from a tap.
  const settingsReady = Boolean(user && settingsUserId === user.id);
  useEffect(() => {
    if (!user || !settingsReady || !reminders.available) return;
    let active = true;
    void (async () => {
      const permission = await reminders.permission();
      if (!active) return;
      setReminderPermission(permission);
      if (reminderAction(state.reminderEnabled, permission) === 'schedule')
        await reminders.enable(user.id, state.reminderTime);
      else await reminders.disable(user.id);
    })();
    return () => {
      active = false;
    };
  }, [foregroundCount, settingsReady, state.reminderEnabled, state.reminderTime, user]);

  const saveProfile = useCallback(
    async (displayName: string, avatar?: { mimeType: string; uri: string }): Promise<ActionResult> => {
      if (!user) return { error: 'Sign in first.' };
      const cleanName = displayName.trim();
      if (!cleanName) return { error: 'Display name cannot be empty.' };
      try {
        let avatarPath = state.avatarPath;
        let avatarUrl = state.avatarUrl;
        if (avatar) {
          const extension = avatar.mimeType.includes('png') ? 'png' : 'jpg';
          avatarPath = `${user.id}/profile/avatar-${Date.now()}.${extension}`;
          const bytes = await new File(avatar.uri).arrayBuffer();
          const { error: uploadError } = await supabase.storage.from('journal-media').upload(avatarPath, bytes, {
            contentType: avatar.mimeType,
            upsert: false,
          });
          if (uploadError) throw uploadError;
          avatarUrl = await signedAvatarUrl(avatarPath);
        }
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_path: avatarPath, display_name: cleanName })
          .eq('id', user.id);
        if (error) throw error;
        // The old photo goes only after the profile points at the new one; if removing it fails, it
        // just stays in storage as before.
        const replaced = replacedAvatarPath(state.avatarPath, avatarPath, user.id);
        if (replaced)
          await supabase.storage
            .from('journal-media')
            .remove([replaced])
            .catch(() => undefined);
        await supabase.auth.updateUser({ data: { full_name: cleanName } });
        updateLocal({ ...state, avatarPath, avatarUrl, displayName: cleanName });
        return { error: null };
      } catch (caught) {
        return {
          error:
            storageLimitMessage(caught) ?? (caught instanceof Error ? caught.message : 'Profile could not be saved.'),
        };
      }
    },
    [state, updateLocal, user],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...state,
      aiFeaturesAllowed: aiFeaturesAllowed(state.aiFeaturesAllowed, settingsUserId, user?.id),
      allowReminderNotifications,
      dismissReminderPrompt,
      loading,
      noteTextSize: noteTextSizeOf(state.noteTextSize),
      reminderAvailable: reminders.available,
      reminderPermission,
      saveProfile,
      setAiFeaturesAllowed,
      setNoteTextSize,
      setReminder,
      setTheme,
    }),
    [
      allowReminderNotifications,
      dismissReminderPrompt,
      loading,
      reminderPermission,
      saveProfile,
      setAiFeaturesAllowed,
      setNoteTextSize,
      setReminder,
      setTheme,
      settingsUserId,
      state,
      user?.id,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider.');
  return context;
}
