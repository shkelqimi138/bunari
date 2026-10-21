// Daily reminder rules: what this phone does with the account's reminder setting, and its time
export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

// schedule: notifications are allowed, so the reminder is scheduled at the account's time.
// ask: notifications were never asked for on this phone; the app explains the reminder first and
//      asks only when the user taps to allow it.
// blocked: notifications are off for Bunari in iPhone Settings; only this phone goes without, the
//          account keeps its setting for the user's other devices.
// cancel: the reminder is off for the account.
export type ReminderAction = 'ask' | 'blocked' | 'cancel' | 'schedule';

export const defaultReminderTime = '20:00';

export function reminderAction(enabled: boolean, permission: ReminderPermission): ReminderAction {
  if (!enabled) return 'cancel';
  if (permission === 'granted') return 'schedule';
  return permission === 'denied' ? 'blocked' : 'ask';
}

// "HH:MM" from any valid hour and minute; anything else falls back to the default time.
export function normalizeReminderTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) return defaultReminderTime;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Today at the reminder's time, for the time picker.
export function reminderTimeAsDate(time: string, today: Date = new Date()) {
  const [hour, minute] = normalizeReminderTime(time).split(':').map(Number);
  const date = new Date(today);
  date.setHours(hour ?? 20, minute ?? 0, 0, 0);
  return date;
}

// The "HH:MM" a time picker's date stands for, in the phone's own time.
export function reminderTimeFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
