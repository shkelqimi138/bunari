// What Bunari tells people before AI features send their entries to OpenAI (App Review 5.1.2(i):
// say which third-party AI gets the data, and ask first)
// Mood suggestions and Weekly Insight send regular entries; the daily prompt sends only the date, so it
// needs no permission. Keep this in line with the privacy policy's "AI features" (website/index.html).
export const aiPermissionQuestion = {
  allow: 'Allow',
  message:
    "Suggest a mood and Weekly Insight send the text of your regular entries to OpenAI, through Bunari's server, to write a reply. OpenAI does not train on it and deletes it within 30 days. Private entries are never sent. You can turn this off in Account.",
  notNow: 'Not now',
  title: 'Use AI on your entries?',
} as const;

// Weekly Insight, before it is allowed on this device.
export const weeklyInsightDisclosure =
  "To find patterns, Bunari sends the date, title, mood and text of this week's regular entries to OpenAI. OpenAI does not train on them and deletes them within 30 days. Private entries are never sent. You can turn this off in Account.";

// The Account footer under the switch.
export const aiPermissionSummary =
  'Suggest a mood and Weekly Insight send your regular entries to OpenAI, which deletes them within 30 days. Private entries are never sent. The daily prompt never uses your entries.';

// The setting is saved on each device and is off until the user allows it there. It counts only once
// the settings in memory belong to the signed-in account: right after another account signs in on the
// same iPhone, the previous account's settings are still shown until the new ones load, and its
// permission must not send the new account's entries (code review, 2026-10-07).
export function aiFeaturesAllowed(
  saved: boolean | undefined,
  settingsUserId: string | null,
  userId: string | null | undefined,
) {
  return saved === true && Boolean(userId) && settingsUserId === userId;
}
