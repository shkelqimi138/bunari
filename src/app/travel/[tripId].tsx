// Trip detail screen with the trip's entries and trip deletion
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarRange, ChevronLeft, MapPin, Plus, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SwipeableEntryRow, useEntryActions } from '@/components/entry/entry-row-actions';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { formatEntryDate, formatTripDateRange, notesFolderId } from '@/domain/journal';
import { useJournal } from '@/state/journal-context';
import { colors, radii, spacing } from '@/theme/tokens';

export default function TripDetailScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const { deleteTrip, entries, trips } = useJournal();
  const { rowProps } = useEntryActions();
  const trip = trips.find((item) => item.id === tripId);

  if (!trip) {
    return (
      <Screen style={styles.notFound}>
        <AppText variant="screenTitle">Trip not found</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <AppText color="accent">Go back</AppText>
        </Pressable>
      </Screen>
    );
  }

  const start = new Date(`${trip.startDate}T00:00:00`).getTime();
  const end = new Date(`${trip.endDate}T23:59:59.999`).getTime();
  // Entries linked to the trip, plus old Travel entries written during it.
  const tripEntries = entries
    .filter(
      (entry) =>
        entry.tripId === trip.id ||
        (entry.legacyTravel &&
          !entry.tripId &&
          Date.parse(entry.createdAt) >= start &&
          Date.parse(entry.createdAt) <= end),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.topBar}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <View style={styles.topActions}>
          <IconButton
            accessibilityLabel="Delete trip"
            icon={Trash2}
            onPress={() =>
              Alert.alert('Delete trip?', 'Its entries stay in your journal.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteTrip(trip.id);
                    router.back();
                  },
                },
              ])
            }
          />
          <IconButton
            accessibilityLabel="Add entry to this trip"
            icon={Plus}
            onPress={() =>
              router.push({ pathname: '/entry/new', params: { sectionId: notesFolderId, tripId: trip.id } })
            }
            tone="accent"
          />
        </View>
      </View>
      <View style={styles.hero}>
        <AppText style={styles.emoji}>{trip.emoji}</AppText>
        <AppText variant="screenTitle">{trip.destination}</AppText>
        <View style={styles.dateRow}>
          <CalendarRange color={colors.accent} size={16} strokeWidth={1.8} />
          <AppText color="accent" numeric variant="caption">
            {formatTripDateRange(trip)}
          </AppText>
        </View>
        <AppText color="dim" numeric variant="label">
          {tripEntries.length} {tripEntries.length === 1 ? 'entry' : 'entries'} in this range
        </AppText>
      </View>

      <View style={styles.entries}>
        {tripEntries.map((entry) => (
          <SwipeableEntryRow entry={entry} key={entry.id}>
            <Pressable
              {...rowProps(entry)}
              accessibilityLabel={`Open entry: ${entry.title}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: entry.id } })}
              style={({ pressed }) => [styles.entryCard, pressed && styles.pressed]}
            >
              <View style={styles.entryMeta}>
                <AppText color="accent" numeric variant="label">
                  {formatEntryDate(entry.createdAt)}
                </AppText>
                {entry.locationLabel && (
                  <View style={styles.location}>
                    <MapPin color={colors.textDim} size={13} strokeWidth={1.8} />
                    <AppText color="dim" variant="caption">
                      {entry.locationLabel}
                    </AppText>
                  </View>
                )}
              </View>
              <AppText variant="cardTitle">{entry.title}</AppText>
              <AppText color="dim" numberOfLines={2} variant="caption">
                {entry.description || entry.plainText}
              </AppText>
            </Pressable>
          </SwipeableEntryRow>
        ))}
        {!tripEntries.length && (
          <View style={styles.empty}>
            <AppText color="dim" style={styles.emptyCopy}>
              Entries you add to this trip will appear here.
            </AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[8], paddingTop: spacing[3] },
  notFound: { gap: spacing[4], justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', gap: spacing[2] },
  hero: { gap: spacing[2], marginTop: spacing[5] },
  emoji: { fontSize: 33, lineHeight: 38 },
  dateRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  entries: { gap: spacing[3], marginTop: spacing[6] },
  entryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[4],
  },
  entryMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  location: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing[8],
  },
  emptyCopy: { textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
