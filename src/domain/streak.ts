// Writing streak: consecutive days with at least one entry, in the phone's local time
export function streakDayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

export function wroteOn(entryDates: Date[], day: Date) {
  const key = streakDayKey(day);
  return entryDates.some((date) => streakDayKey(date) === key);
}

// Consecutive days with an entry, ending today; while nothing is written yet today, ending
// yesterday, so the streak stays alive until the day is over.
export function currentStreak(entryDates: Date[], now: Date = new Date()) {
  const days = new Set(entryDates.map(streakDayKey));
  // Noon keeps the day steps clear of daylight-saving changes.
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(streakDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(streakDayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
