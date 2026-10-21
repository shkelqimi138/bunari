// Reminder time choices outside iOS (the historical web preview), where Apple's picker is missing
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, radii, spacing } from '@/theme/tokens';

type ReminderTimePickerProps = { onChange: (time: string) => void; value: string };

const times = ['08:00', '12:00', '18:00', '20:00', '21:00'];

export function ReminderTimePicker({ onChange, value }: ReminderTimePickerProps) {
  return (
    <View style={styles.row}>
      {times.map((time) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === time }}
          key={time}
          onPress={() => onChange(time)}
          style={[styles.choice, value === time && styles.active]}
        >
          <AppText color={value === time ? 'accent' : 'primary'} numeric variant="caption">
            {time}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  choice: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 36,
    minWidth: 74,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
