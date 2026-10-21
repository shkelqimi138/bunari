// Web preview reminders stub; daily reminders are available only in the iOS app
import type { ReminderPermission } from '@/domain/reminder';

export const reminders = {
  available: false,
  disable: async (_userId: string) => undefined,
  enable: async (_userId: string, _time: string): Promise<{ denied?: boolean; error: string | null }> => ({
    error: 'Daily reminders are available in the iOS app.',
  }),
  permission: async (): Promise<ReminderPermission> => 'denied',
};
