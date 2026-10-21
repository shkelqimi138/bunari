// Schedules and cancels daily writing reminder notifications
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// Same as ReminderPermission in src/domain/reminder.ts; written out here because this module may not
// import app code (tests/notifications.test.mjs), so no journal data can reach a notification.
type ReminderPermission = 'granted' | 'denied' | 'undetermined';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notifications only ever show this fixed text: never a journal entry, least of all a Private one.
// The reminder API takes only the user id and time, and `tests/notifications.test.mjs` guards this.
const title = 'Time to reflect';
const body = 'Take a quiet moment and write what is on your mind.';
// Marks Bunari's reminder, so every copy can be found and cancelled; builds 8 and older scheduled
// it without the mark, so those are recognized by their title.
const reminderKind = 'daily-reminder';

// Where builds 8 and older kept the reminder's id; only removed now.
function legacyStorageKey(userId: string) {
  return `daily-reminder.v1.${userId}`;
}

// Runs reminder changes one after another: two at once could each schedule a reminder, and the
// extra one would ring every day with no way to turn it off.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// A phone has at most one Bunari reminder, whoever is signed in, so all of them are cancelled.
async function cancelAllReminders() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const ours = pending.filter(
    (request) => request.content.data?.kind === reminderKind || request.content.title === title,
  );
  await Promise.all(ours.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

function permissionOf(status: { granted: boolean; canAskAgain?: boolean; status?: string }): ReminderPermission {
  if (status.granted) return 'granted';
  return status.status === 'undetermined' || status.canAskAgain ? 'undetermined' : 'denied';
}

export const reminders = {
  available: true,
  disable: (userId: string) =>
    oneAtATime(async () => {
      await cancelAllReminders();
      await AsyncStorage.removeItem(legacyStorageKey(userId));
    }),
  // Schedules the reminder, asking for notification permission first when it was never asked.
  enable: (userId: string, time: string) =>
    oneAtATime(async () => {
      const permission = await Notifications.getPermissionsAsync();
      const finalPermission = permission.granted ? permission : await Notifications.requestPermissionsAsync();
      if (!finalPermission.granted) return { denied: true, error: 'Notification permission was not granted.' };
      await cancelAllReminders();
      await AsyncStorage.removeItem(legacyStorageKey(userId));
      const parts = time.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        content: { body, data: { kind: reminderKind, url: '/' }, title },
        trigger: {
          hour: parts[0] ?? 20,
          minute: parts[1] ?? 0,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
        },
      });
      return { error: null };
    }),
  // The notification permission, without asking for it.
  permission: async (): Promise<ReminderPermission> => permissionOf(await Notifications.getPermissionsAsync()),
};
