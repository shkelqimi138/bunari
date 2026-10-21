// iOS time picker for the daily reminder (Apple's own compact time field)
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

import { reminderTimeAsDate, reminderTimeFromDate } from '@/domain/reminder';
import { darkPalette, lightPalette } from '@/theme/tokens';

type ReminderTimePickerProps = { onChange: (time: string) => void; value: string };

// The picker reports every step while the wheel turns, so the time is saved once it rests.
const saveDelayMs = 700;

export function ReminderTimePicker({ onChange, value }: ReminderTimePickerProps) {
  const scheme = useColorScheme();
  const [selection, setSelection] = useState(() => reminderTimeAsDate(value));
  const [shownValue, setShownValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  // A time saved elsewhere (another device, or this picker once saved) replaces the shown one.
  if (shownValue !== value) {
    setShownValue(value);
    setSelection(reminderTimeAsDate(value));
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Host matchContents>
      <DatePicker
        displayedComponents={['hourAndMinute']}
        modifiers={[
          datePickerStyle('compact'),
          labelsHidden(),
          tint(scheme === 'light' ? lightPalette.accent : darkPalette.accent),
        ]}
        onDateChange={(date) => {
          setSelection(date);
          if (timer.current) clearTimeout(timer.current);
          const time = reminderTimeFromDate(date);
          timer.current = setTimeout(() => {
            if (time !== value) onChangeRef.current(time);
          }, saveDelayMs);
        }}
        selection={selection}
        title="Reminder time"
      />
    </Host>
  );
}
