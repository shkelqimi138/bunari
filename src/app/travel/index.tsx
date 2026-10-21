// Trips screen listing trips and creating new ones
import { useRouter } from 'expo-router';
import { CalendarRange, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { DateField } from '@/components/ui/date-field';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { formatTripDateRange, type Trip } from '@/domain/journal';
import { dateRangeProblem, storedDateToTyped, typedDateToStored } from '@/domain/typed-date';
import { useJournal } from '@/state/journal-context';
import { colors, fontFamilies, layout, radii, spacing } from '@/theme/tokens';

function entriesDuringTrip(trip: Trip, entries: ReturnType<typeof useJournal>['entries']) {
  const start = new Date(`${trip.startDate}T00:00:00`).getTime();
  const end = new Date(`${trip.endDate}T23:59:59.999`).getTime();
  // Entries linked to the trip, plus old Travel entries written during it.
  return entries.filter(
    (entry) =>
      entry.tripId === trip.id ||
      (entry.legacyTravel &&
        !entry.tripId &&
        Date.parse(entry.createdAt) >= start &&
        Date.parse(entry.createdAt) <= end),
  );
}

// Today (or a few days later) as typed in the form, DD.MM.YYYY.
function typedLocalDate(daysFromToday = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return storedDateToTyped(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  );
}

export default function TravelScreen() {
  const router = useRouter();
  const { createTrip, entries, trips } = useJournal();
  const [modalOpen, setModalOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [startDate, setStartDate] = useState(typedLocalDate());
  const [endDate, setEndDate] = useState(typedLocalDate(2));
  const sortedTrips = useMemo(() => [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate)), [trips]);

  const saveTrip = () => {
    if (!destination.trim() || !emoji.trim()) {
      Alert.alert('Trip details needed', 'Add a destination and emoji.');
      return;
    }
    // The form shows DD.MM.YYYY; trips are stored as YYYY-MM-DD, as before.
    const start = typedDateToStored(startDate);
    const end = typedDateToStored(endDate);
    const problem = dateRangeProblem(startDate, endDate);
    if (problem || !start || !end) {
      Alert.alert('Check the dates', problem ?? 'Invalid dates.');
      return;
    }
    createTrip({ destination: destination.trim(), emoji: emoji.trim(), startDate: start, endDate: end });
    setDestination('');
    setEmoji('✈️');
    setStartDate(typedLocalDate());
    setEndDate(typedLocalDate(2));
    setModalOpen(false);
  };

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.topBar}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <IconButton accessibilityLabel="Add trip" icon={Plus} onPress={() => setModalOpen(true)} tone="accent" />
      </View>
      <View style={styles.header}>
        <AppText variant="screenTitle">Trips</AppText>
        <AppText color="dim" style={styles.subtitle}>
          Entries you add to a trip are saved in Notes and collected here.
        </AppText>
      </View>

      <View style={styles.tripList}>
        {sortedTrips.map((trip) => {
          const entryCount = entriesDuringTrip(trip, entries).length;
          return (
            <Pressable
              accessibilityLabel={`Open trip to ${trip.destination}`}
              accessibilityRole="button"
              key={trip.id}
              onPress={() => router.push({ pathname: '/travel/[tripId]', params: { tripId: trip.id } })}
              style={({ pressed }) => [styles.tripCard, pressed && styles.pressed]}
            >
              <View style={styles.emoji}>
                <AppText style={styles.emojiText}>{trip.emoji}</AppText>
              </View>
              <View style={styles.tripCopy}>
                <AppText style={styles.destination} variant="cardTitle">
                  {trip.destination}
                </AppText>
                <View style={styles.dateRow}>
                  <CalendarRange color={colors.textDim} size={14} strokeWidth={1.8} />
                  <AppText color="dim" numeric variant="caption">
                    {formatTripDateRange(trip)}
                  </AppText>
                </View>
                <AppText color="accent" numeric variant="label">
                  {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                </AppText>
              </View>
              <ChevronRight color={colors.textDim} size={20} strokeWidth={1.8} />
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setModalOpen(true)} style={styles.addTripButton}>
        <Plus color={colors.accent} size={18} strokeWidth={1.8} />
        <AppText color="accent" variant="cardTitle">
          Add trip
        </AppText>
      </Pressable>

      <TripModal
        destination={destination}
        emoji={emoji}
        endDate={endDate}
        onClose={() => setModalOpen(false)}
        onDestinationChange={setDestination}
        onEmojiChange={setEmoji}
        onEndDateChange={setEndDate}
        onSave={saveTrip}
        onStartDateChange={setStartDate}
        startDate={startDate}
        visible={modalOpen}
      />
    </Screen>
  );
}

type TripModalProps = {
  destination: string;
  emoji: string;
  endDate: string;
  onClose: () => void;
  onDestinationChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSave: () => void;
  onStartDateChange: (value: string) => void;
  startDate: string;
  visible: boolean;
};

function TripModal(props: TripModalProps) {
  // Said as soon as a date is not a complete, real date (e.g. after deleting a digit), not only on Save.
  const dateProblem = dateRangeProblem(props.startDate, props.endDate);
  const startInvalid = typedDateToStored(props.startDate) === null;
  const endInvalid = typedDateToStored(props.endDate) === null || (!startInvalid && dateProblem !== null);
  // VoiceOver does not read the message below as it appears, so a wrong date's field says it instead.
  const dateHint = 'Day, month and year';

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={props.visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable accessible={false} onPress={props.onClose} style={styles.backdrop}>
          <Pressable
            accessible={false}
            accessibilityViewIsModal
            onPress={(event) => {
              event.stopPropagation();
              Keyboard.dismiss();
            }}
            style={styles.sheet}
          >
            <View style={styles.sheetHeader}>
              <AppText variant="cardTitle">New trip</AppText>
              <IconButton accessibilityLabel="Close trip form" icon={X} onPress={props.onClose} />
            </View>
            <AppText color="dim" variant="label">
              Destination
            </AppText>
            <View style={styles.destinationInputs}>
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Trip emoji"
                maxLength={4}
                onChangeText={props.onEmojiChange}
                style={[styles.input, styles.emojiInput]}
                value={props.emoji}
              />
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Trip destination"
                onChangeText={props.onDestinationChange}
                placeholder="City or place"
                placeholderTextColor={colors.textDim}
                style={[styles.input, styles.destinationInput]}
                value={props.destination}
              />
            </View>
            <AppText color="dim" variant="label">
              Date range
            </AppText>
            <View style={styles.dateInputs}>
              <DateField
                selectionColor={colors.accent}
                accessibilityHint={startInvalid && dateProblem ? dateProblem : dateHint}
                accessibilityLabel="Trip start date"
                onChangeText={props.onStartDateChange}
                placeholderTextColor={colors.textDim}
                style={[styles.input, startInvalid && styles.inputInvalid]}
                value={props.startDate}
              />
              <AppText color="dim">–</AppText>
              <DateField
                selectionColor={colors.accent}
                accessibilityHint={endInvalid && dateProblem ? dateProblem : dateHint}
                accessibilityLabel="Trip end date"
                onChangeText={props.onEndDateChange}
                placeholderTextColor={colors.textDim}
                style={[styles.input, endInvalid && styles.inputInvalid]}
                value={props.endDate}
              />
            </View>
            {dateProblem ? (
              <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
                {dateProblem}
              </AppText>
            ) : null}
            <Pressable accessibilityRole="button" onPress={props.onSave} style={styles.saveButton}>
              <AppText color="onAccent" variant="cardTitle">
                Save trip
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  header: { marginTop: spacing[5] },
  subtitle: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  tripList: { gap: spacing[3], marginTop: spacing[6] },
  tripCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 102,
    padding: spacing[4],
  },
  emoji: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.control,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  emojiText: { fontSize: 24, lineHeight: 29 },
  tripCopy: { flex: 1, gap: spacing[2] },
  destination: { fontSize: 16, lineHeight: 21 },
  dateRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  addTripButton: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    marginTop: spacing[5],
    minHeight: 48,
  },
  pressed: { opacity: 0.72 },
  keyboard: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.68)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    gap: spacing[3],
    paddingBottom: spacing[8],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[3],
  },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  destinationInputs: { flexDirection: 'row', gap: spacing[2] },
  dateInputs: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  inputInvalid: { borderColor: colors.danger },
  emojiInput: { flex: 0, fontSize: 20, textAlign: 'center', width: 54 },
  destinationInput: { flex: 1 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing[2],
    minHeight: 46,
  },
});
