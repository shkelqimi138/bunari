// Grouped settings list: titled sections of rows, like iOS Settings, in Bunari's colors
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, Fragment, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, layout, radii, spacing } from '@/theme/tokens';

// A titled group of rows with thin lines between them; `footer` explains the group below it.
export function SettingsSection({ children, footer, title }: PropsWithChildren<{ footer?: string; title?: string }>) {
  // Rows hidden with `condition ? <Row /> : null` leave no empty space or extra line; each row keeps
  // its place-based key, so showing or hiding one does not reset the others.
  const items = Children.toArray(children);
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? (
        <AppText accessibilityRole="header" color="dim" style={styles.sectionTitle} variant="label">
          {title}
        </AppText>
      ) : null}
      <View style={styles.group}>
        {items.map((item, index) => (
          <Fragment key={isValidElement(item) && item.key !== null ? item.key : index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {item}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText color="dim" style={styles.footer} variant="caption">
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

type SettingsRowProps = {
  // VoiceOver: the label (and value) is read unless these say otherwise.
  accessibilityHint?: string;
  accessibilityLabel?: string;
  detail?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  // Opens something: the whole row is a button with a chevron (unless `chevron` is false).
  onPress?: () => void;
  chevron?: boolean;
  // A switch on the right; the row itself is then not a button.
  onSwitchChange?: (value: boolean) => void;
  switchValue?: boolean;
  tone?: 'default' | 'danger';
  // Anything else on the right, e.g. a copy button or the time picker.
  trailing?: ReactNode;
  // A short value on the right, e.g. "Dark" or "1.0.1 (9)".
  value?: string;
};

export function SettingsRow({
  accessibilityHint,
  accessibilityLabel,
  chevron = true,
  detail,
  disabled = false,
  icon: Icon,
  label,
  onPress,
  onSwitchChange,
  switchValue,
  tone = 'default',
  trailing,
  value,
}: SettingsRowProps) {
  const hasSwitch = switchValue !== undefined;
  const iconColor = tone === 'danger' ? colors.danger : colors.accent;
  const content = (
    <>
      {Icon ? <Icon color={iconColor} size={19} strokeWidth={1.8} /> : null}
      <View style={styles.copy}>
        <AppText color={tone === 'danger' ? 'danger' : 'primary'}>{label}</AppText>
        {detail ? (
          <AppText color="dim" variant="caption">
            {detail}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText color="dim" numberOfLines={1} numeric style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {hasSwitch ? (
        <Switch
          accessibilityLabel={label}
          disabled={disabled}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
          value={switchValue}
        />
      ) : null}
      {onPress && !hasSwitch && chevron ? <ChevronRight color={colors.textDim} size={18} strokeWidth={1.8} /> : null}
    </>
  );

  if (!onPress || hasSwitch) return <View style={[styles.row, disabled && styles.disabled]}>{content}</View>;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {content}
    </Pressable>
  );
}

// Free-form content inside a section (a notice, a message, the profile editor), padded like a row.
export function SettingsBlock({ children }: PropsWithChildren) {
  return <View style={styles.block}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing[2] },
  sectionTitle: { paddingHorizontal: spacing[4] },
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, marginLeft: spacing[4] },
  footer: { paddingHorizontal: spacing[4] },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: layout.minimumTouchTarget + 6,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  copy: { flex: 1, gap: spacing[1] },
  value: { flexShrink: 1, maxWidth: '50%', textAlign: 'right' },
  block: { gap: spacing[3], padding: spacing[4] },
  pressed: { backgroundColor: colors.surfaceRaised },
  disabled: { opacity: 0.5 },
});
