// Platform-neutral declaration of the reminders API
import type { ReminderPermission } from '@/domain/reminder';

export declare const reminders: {
  available: boolean;
  // Cancels every Bunari reminder on this device.
  disable(userId: string): Promise<void>;
  // Schedules the reminder, asking for notification permission first when it was never asked.
  // denied: the permission was declined, so nothing was scheduled.
  enable(userId: string, time: string): Promise<{ denied?: boolean; error: string | null }>;
  // The notification permission, without asking for it.
  permission(): Promise<ReminderPermission>;
};
