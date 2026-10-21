// In-memory expo-notifications double: records every scheduled notification and keeps the list of
// upcoming ones, like iOS does, so cancelling and listing them can be tested
export const scheduled = [];
const upcoming = new Map();
// Tests can set granted to false (and status to 'denied' or 'undetermined') to act as if the user
// declined notifications or was never asked.
export const permission = { canAskAgain: true, granted: true, status: 'granted' };

export const SchedulableTriggerInputTypes = { DAILY: 'daily' };

export function setNotificationHandler() {}

export async function getPermissionsAsync() {
  return { ...permission };
}

export async function requestPermissionsAsync() {
  return { ...permission };
}

export async function scheduleNotificationAsync(request) {
  scheduled.push(structuredClone(request));
  const identifier = `notification-${scheduled.length}`;
  // A real schedule call takes a moment, which lets overlapping calls interleave as they would on iOS.
  await new Promise((resolve) => setTimeout(resolve, 1));
  upcoming.set(identifier, { ...structuredClone(request), identifier });
  return identifier;
}

export async function cancelScheduledNotificationAsync(identifier) {
  upcoming.delete(identifier);
}

export async function getAllScheduledNotificationsAsync() {
  return [...upcoming.values()].map((request) => structuredClone(request));
}

// Test helpers: the upcoming notifications, and a reminder as builds 8 and older scheduled it.
export function upcomingNotifications() {
  return [...upcoming.values()];
}

export function addUpcoming(request) {
  const identifier = `older-${upcoming.size + 1}`;
  upcoming.set(identifier, { ...structuredClone(request), identifier });
}
